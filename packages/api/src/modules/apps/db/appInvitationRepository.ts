import { and, type Column, eq, not, sql } from "drizzle-orm";

import { anyOf, insertBatches, type Orm, ormOf, type Tx } from "../../../core/db";
import { appInvitations } from "./appInvitationsTable";

/** A pending invitation in a connected app, as its connection's last scan read it. */
export interface AppInvitation {
  id: string;
  connectionId: string;
  appId: string;
  /** Lowercased. */
  email: string;
  /** As the app gives them; null when it does not. */
  invitedAt: Date | null;
  expiresAt: Date | null;
  /** When a scan first saw it. */
  firstSeenAt: Date;
}

/** Pending invitations in Postgres, through the pool or inside a transaction. */
export interface AppInvitationRepository {
  /**
   * Makes the connection's invitations exactly `invitations`, one per email: a known one keeps its
   * `firstSeenAt`, a new one gets `seenAt`, and one left out is deleted.
   */
  replaceOfConnection(
    connection: { id: string; appId: string },
    invitations: readonly Pick<AppInvitation, "email" | "invitedAt" | "expiresAt">[],
    seenAt: Date,
  ): Promise<void>;
  /** The invitations of `emails` in the connections `connectionIds`. */
  findByEmails(invitations: {
    connectionIds: readonly string[];
    emails: readonly string[];
    targets?: readonly InviteTarget[];
  }): Promise<AppInvitation[]>;
}

export interface InviteTarget {
  connectionId: string;
  email: string;
}

export function appInvitationRepository(db: Orm | Tx): AppInvitationRepository {
  const orm = () => ormOf(db);
  return {
    replaceOfConnection: async ({ id: connectionId, appId }, invitations, seenAt) => {
      await orm()
        .delete(appInvitations)
        .where(
          and(
            eq(appInvitations.connectionId, connectionId),
            not(
              anyOf(
                appInvitations.email,
                invitations.map(({ email }) => email),
              ),
            ),
          ),
        );
      const rows = invitations.map((invitation) => ({
        ...invitation,
        connectionId,
        appId,
        firstSeenAt: seenAt,
      }));
      for (const batch of insertBatches(rows)) {
        await orm()
          .insert(appInvitations)
          .values(batch)
          .onConflictDoUpdate({
            target: [appInvitations.connectionId, appInvitations.email],
            set: { invitedAt: sql`excluded.invited_at`, expiresAt: sql`excluded.expires_at` },
          });
      }
    },
    findByEmails: ({ connectionIds, emails, targets }) =>
      orm()
        .select()
        .from(appInvitations)
        .where(
          and(
            anyOf(appInvitations.connectionId, connectionIds),
            anyOf(appInvitations.email, emails),
            targets &&
              matchesInviteTargets(appInvitations.connectionId, appInvitations.email, targets),
          ),
        ),
  };
}

export function matchesInviteTargets(
  connection: Column,
  email: Column,
  targets: readonly InviteTarget[],
) {
  return sql`(${connection},${email}) in (select * from unnest(${sql.param(targets.map((target) => target.connectionId))}::uuid[],${sql.param(targets.map((target) => target.email))}::text[]))`;
}
