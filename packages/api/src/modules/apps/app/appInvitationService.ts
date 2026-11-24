import type { PendingInvitation } from "../../../core/connectors";
import type { Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import { appInvitationRepository } from "../db";

/** Pending invitations in connected apps, as the scans read them; an invitation is never access. */
export interface AppInvitationService {
  /**
   * Makes the connection's stored invitations exactly those its scan read, one per email, joining
   * `tx`: a known one keeps when it was first seen, and one no longer read is deleted. System only.
   */
  replaceInvitations: (
    ctx: SecurityContext,
    tx: Tx,
    scanned: {
      connection: { id: string; appId: string };
      invitations: readonly PendingInvitation[];
    },
  ) => Promise<void>;
}

export function createAppInvitationService(): AppInvitationService {
  return {
    async replaceInvitations(ctx, tx, { connection, invitations }) {
      ctx.requireSystem();
      // An email read twice, such as on two pages, is one invitation: the last read stays.
      const byEmail = new Map(
        invitations.map(({ email, invitedAt, expiresAt }) => [
          email.toLowerCase(),
          {
            email: email.toLowerCase(),
            invitedAt: invitedAt === null ? null : new Date(invitedAt),
            expiresAt: expiresAt === null ? null : new Date(expiresAt),
          },
        ]),
      );
      await appInvitationRepository(tx).replaceOfConnection(
        connection,
        [...byEmail.values()],
        new Date(),
      );
    },
  };
}
