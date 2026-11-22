import {
  type AccountPhoto,
  type Connector,
  ConnectorError,
  type ConnectorSession,
  type ImportedAccount,
} from "../../../core/connectors";
import type { Orm } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { importSourceRepository } from "../db";
import { photoUpdateOf } from "../domain";
import type { DirectoryPeople } from "../ports";

/** One directory scan, between reading its accounts and saving them. */
export interface PhotoScan {
  sourceId: string;
  connector: Connector;
  session: ConnectorSession;
  accounts: readonly ImportedAccount[];
  /** Runs a connector call, trying it again while it is rate-limited or unavailable. */
  retrying: <T>(call: () => Promise<T>) => Promise<T>;
}

/**
 * The photos a directory's scan changes, by source key: each one `photoUpdateOf` reads, and null
 * for each the directory removed. A failed read leaves its person out, so they keep their photo.
 */
export async function readChangedPhotos(
  ctx: SecurityContext,
  dependencies: { orm: Orm; logger: Logger; directory: DirectoryPeople },
  scan: PhotoScan,
): Promise<Map<string, AccountPhoto | null>> {
  const { connector, session } = scan;
  if (!connector.isDirectory || !connector.photoVersion || !session.readPhoto) {
    return new Map();
  }
  const photoVersion = connector.photoVersion.bind(connector);
  const updates = await photoUpdates(ctx, dependencies, scan, photoVersion);
  const photos = new Map<string, AccountPhoto | null>(
    updates.cleared.map((sourceKey) => [sourceKey, null]),
  );
  for (let start = 0; start < updates.read.length; start += PHOTOS_AT_ONCE) {
    const batch = updates.read.slice(start, start + PHOTOS_AT_ONCE);
    await Promise.all(
      batch.map(async (sourceKey) => {
        const photo = await readKeepingOnFailure(dependencies.logger, scan, sourceKey);
        if (photo !== undefined) photos.set(sourceKey, photo);
      }),
    );
  }
  return photos;
}

/** Photo reads at once, as many as the connector's tokens lists, well inside Google's quota. */
const PHOTOS_AT_ONCE = 10;

/** The source keys of the directory's people whose photo to read, and of those whose to clear. */
async function photoUpdates(
  ctx: SecurityContext,
  { orm, directory }: { orm: Orm; directory: DirectoryPeople },
  { sourceId, accounts }: PhotoScan,
  photoVersion: NonNullable<Connector["photoVersion"]>,
): Promise<{ read: string[]; cleared: string[] }> {
  const people = accounts.filter(({ values }) => values.appExternalId === null);
  const previousVersions = new Map(
    (await importSourceRepository(orm).findRecords(sourceId)).map(({ sourceKey, raw }) => [
      sourceKey,
      photoVersion(raw),
    ]),
  );
  const withPhoto = await directory.findEmailsWithPhoto(
    ctx,
    orm,
    people.map(({ values }) => values.email),
  );
  const updates = { read: [] as string[], cleared: [] as string[] };
  for (const { sourceKey, raw, values } of people) {
    const update = photoUpdateOf({
      version: photoVersion(raw),
      previousVersion: previousVersions.get(sourceKey) ?? null,
      hasPhoto: withPhoto.has(values.email),
    });
    if (update === "read") updates.read.push(sourceKey);
    if (update === "clear") updates.cleared.push(sourceKey);
  }
  return updates;
}

/** The person's photo, null when they have none, or undefined when the read failed. */
async function readKeepingOnFailure(
  logger: Logger,
  { sourceId, session, retrying }: PhotoScan,
  sourceKey: string,
): Promise<AccountPhoto | null | undefined> {
  try {
    return await retrying(() => session.readPhoto!(sourceKey));
  } catch (error) {
    if (!(error instanceof ConnectorError)) {
      throw error;
    }
    logger.warn({ sourceId, sourceKey, failure: error.code }, "Photo read failed; photo kept");
    return undefined;
  }
}
