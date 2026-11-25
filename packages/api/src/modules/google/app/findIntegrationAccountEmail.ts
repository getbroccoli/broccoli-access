import type { Orm, Tx } from "../../../core/db";
import { integrationUserRepository } from "../db";
import { GOOGLE_WORKSPACE } from "../domain";
import type { ConnectedApps, ScannedMembers } from "../ports";

/** Identifies the integration user's accounts outside the directory by its current directory address. */
export async function findIntegrationAccountEmail(
  db: Orm | Tx,
  { connectedApps, records }: { connectedApps: ConnectedApps; records: ScannedMembers },
) {
  const user = await integrationUserRepository(db).find();
  if (!user) return null;
  const directory = await connectedApps.readConnection(db, GOOGLE_WORKSPACE);
  if (!directory) return null;
  // shortcut: matching starts when a directory scan finds the stable Google id. Until then an app scan has no verified email.
  return records.findMemberEmail(db, directory.id, user.googleUserId);
}

/** Whether the directory's last scan found the integration user suspended; false before a scan finds it. */
export async function isIntegrationUserSuspended(
  db: Orm | Tx,
  { connectedApps, records }: { connectedApps: ConnectedApps; records: ScannedMembers },
): Promise<boolean> {
  const user = await integrationUserRepository(db).find();
  const directory = await connectedApps.readConnection(db, GOOGLE_WORKSPACE);
  if (!user || !directory) return false;
  // Found by Google's stable id: the directory may have renamed the user since it was created.
  const email = await records.findMemberEmail(db, directory.id, user.googleUserId);
  if (!email) return false;
  const members = await records.findConnectionMembers(db, {
    connectionIds: [directory.id],
    emails: [email],
  });
  return members.some(
    ({ sourceKey, status }) => sourceKey === user.googleUserId && status === "suspended",
  );
}
