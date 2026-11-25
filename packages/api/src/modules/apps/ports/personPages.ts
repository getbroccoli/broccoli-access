import type { AccountAction } from "../../../core/connectors";
import type { Orm, Tx } from "../../../core/db";
import type { SecurityContext } from "../../../core/security";
import type { AccountChange } from "../domain";

/**
 * What Provision reads of people's pages: their apps as the templates module computes them, beside
 * this module's own account and invite rows, all from one read.
 */
export type ReadPersonPages = (
  ctx: SecurityContext,
  employeeIds: readonly string[],
  db: Orm | Tx,
) => Promise<PersonPage[]>;

/** The parts of one person's page Provision decides from. */
export interface PersonPage {
  /** Each of their apps: its state, `missing` among them, and whether its templates still disagree on its role. */
  personApps: readonly { appId: string; state: string | null; roleConflict: boolean }[];
  /** Their accounts, each with the change it offers now. */
  appAccounts: readonly {
    id: string;
    appId: string;
    changeState?: { offeredChange: AccountAction | null; latestChange: LatestChange | null };
  }[];
  /** Their invite rows, each with whether Invite is offered and its latest invite. */
  appInvites: readonly {
    appId: string;
    offered: boolean;
    latestInvite: LatestChange | null;
  }[];
}

/** What a row's latest change asked for and how it ended. */
type LatestChange = Pick<AccountChange, "action" | "status" | "error">;
