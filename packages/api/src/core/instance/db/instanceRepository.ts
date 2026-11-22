import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { account, user } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";
import {
  Instance,
  type MailConfig,
  type MailSource,
  type SetupSession,
  type SetupStep,
} from "../domain";
import { instance } from "./instanceTable";

/** The instance row in Postgres, through the pool or inside a transaction. */
export interface InstanceRepository {
  /** The whole instance row in one read. */
  readInstance(): Promise<Instance>;
  /** As `readInstance`, locking the row until the transaction ends. */
  lockInstance(): Promise<Instance>;
  /** The owner's id and sign-in email, or null before an owner exists. */
  readOwner(): Promise<{ userId: string; email: string } | null>;
  saveSetupSession(session: SetupSession): Promise<void>;
  clearSetupSession(): Promise<void>;
  setOwner(userId: string, step: SetupStep): Promise<void>;
  /** Creates a user who signs in with their Google account, which keeps no tokens; returns their id. */
  createGoogleUser(googleUser: {
    googleUserId: string;
    email: string;
    name: string;
  }): Promise<string>;
  /** Moves the step from `from` to `to`; does nothing at any other step. Returns whether it moved. */
  advanceStep(from: SetupStep, to: SetupStep): Promise<boolean>;
  /** The mail choice, no email until the owner chooses, and the origin its links use. */
  readMailSettings(): Promise<MailConfig & { linkOrigin: string | null }>;
  /** The mail choice with its encrypted SMTP URL or Resend key, read together so they match. */
  readMailSender(): Promise<{
    source: MailSource;
    from: string | null;
    encryptedSecret: string | null;
    linkOrigin: string | null;
  }>;
  /** Replaces the whole mail choice. */
  storeMailSettings(settings: {
    source: MailSource;
    from: string | null;
    encryptedSecret: string | null;
    linkOrigin: string | null;
  }): Promise<void>;
}

export function instanceRepository(db: Orm | Tx): InstanceRepository {
  const orm = () => ormOf(db);

  const selectInstance = () =>
    orm()
      .select({
        ownerUserId: instance.ownerUserId,
        step: instance.setupStep,
        mailSource: instance.mailSource,
        ...sessionColumns,
      })
      .from(instance);

  return {
    readInstance: async () => toInstance(await selectInstance()),

    lockInstance: async () => toInstance(await selectInstance().for("update")),

    readOwner: async (): Promise<{ userId: string; email: string } | null> => {
      const [row] = await orm()
        .select({ userId: user.id, email: user.email })
        .from(instance)
        .innerJoin(user, eq(user.id, instance.ownerUserId));
      return row ?? null;
    },

    saveSetupSession: async ({ tokenHash, expiresAt }: SetupSession): Promise<void> => {
      await orm().update(instance).set({ setupTokenHash: tokenHash, setupExpiresAt: expiresAt });
    },

    clearSetupSession: async (): Promise<void> => {
      await orm().update(instance).set({ setupTokenHash: null, setupExpiresAt: null });
    },

    setOwner: async (userId: string, step: SetupStep): Promise<void> => {
      await orm().update(instance).set({ ownerUserId: userId, setupStep: step });
    },

    createGoogleUser: async ({ googleUserId, email, name }) => {
      const userId = randomUUID();
      await orm().insert(user).values({ id: userId, name, email, emailVerified: true });
      await orm()
        .insert(account)
        .values({ id: randomUUID(), accountId: googleUserId, providerId: "google", userId });
      return userId;
    },

    advanceStep: async (from: SetupStep, to: SetupStep): Promise<boolean> => {
      const result = await orm()
        .update(instance)
        .set({ setupStep: to })
        .where(eq(instance.setupStep, from));
      return (result.rowCount ?? 0) > 0;
    },

    readMailSettings: async () => {
      const [row] = await orm()
        .select({
          source: instance.mailSource,
          from: instance.mailFrom,
          hasSecret: sql<boolean>`${instance.encryptedMailSecret} is not null`,
          linkOrigin: instance.mailLinkOrigin,
        })
        .from(instance);
      return {
        source: row?.source ?? "no_email",
        from: row?.from ?? null,
        hasSecret: row?.hasSecret ?? false,
        linkOrigin: row?.linkOrigin ?? null,
      };
    },

    readMailSender: async () => {
      const [row] = await orm()
        .select({
          source: instance.mailSource,
          from: instance.mailFrom,
          encryptedSecret: instance.encryptedMailSecret,
          linkOrigin: instance.mailLinkOrigin,
        })
        .from(instance);
      return {
        source: row?.source ?? "no_email",
        from: row?.from ?? null,
        encryptedSecret: row?.encryptedSecret ?? null,
        linkOrigin: row?.linkOrigin ?? null,
      };
    },

    storeMailSettings: async ({ source, from, encryptedSecret, linkOrigin }) => {
      await orm().update(instance).set({
        mailSource: source,
        mailFrom: from,
        encryptedMailSecret: encryptedSecret,
        mailLinkOrigin: linkOrigin,
      });
    },
  };
}

const sessionColumns = {
  tokenHash: instance.setupTokenHash,
  expiresAt: instance.setupExpiresAt,
};

function toSetupSession({
  tokenHash,
  expiresAt,
}: {
  tokenHash: string | null;
  expiresAt: Date | null;
}): SetupSession | null {
  // A check constraint keeps both columns null or both set.
  return tokenHash && expiresAt ? { tokenHash, expiresAt } : null;
}

function toInstance([row]: {
  ownerUserId: string | null;
  step: SetupStep;
  mailSource: MailSource | null;
  tokenHash: string | null;
  expiresAt: Date | null;
}[]): Instance {
  if (!row) {
    throw new Error("The instance row is missing; migrations insert it");
  }
  return new Instance({
    ownerUserId: row.ownerUserId,
    step: row.step,
    setupSession: toSetupSession(row),
    mailSource: row.mailSource,
  });
}
