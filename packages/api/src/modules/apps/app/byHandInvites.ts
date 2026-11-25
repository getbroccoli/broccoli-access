import type { Orm, Tx } from "../../../core/db";
import { type AppConnection, accountChangeRepository, appAccountRepository } from "../db";
import { byHandInviteStateOf } from "../domain";
import type { AccountChangeDependencies } from "./accountChangeService";
import type { AppInvite } from "./appInvite";
import { otherAppFindingKinds } from "./inAppFacts";

/**
 * The rows of the apps without a connection: the employees' latest invites there, which failed at
 * once for the owner to make by hand. An app connected since shows its connection's row instead,
 * and an app the employee now holds an active account in shows that account.
 */
export async function readByHandInvites(
  { directoryConnectors }: AccountChangeDependencies,
  db: Orm | Tx,
  employeeIds: readonly string[],
  connections: readonly AppConnection[],
  appIds?: readonly string[],
  expected?: readonly { employeeId: string; appId: string }[],
): Promise<AppInvite[]> {
  const latest = await accountChangeRepository(db).findLatestInvitesWithoutConnection(
    employeeIds,
    appIds,
    expected,
  );
  const connectedApps = new Set(connections.map(({ appId }) => appId));
  const waiting = latest.filter(({ appId }) => !connectedApps.has(appId));
  if (!waiting.length) {
    return [];
  }
  // None of these apps has a connection, so no scan decides which of their accounts count.
  const accounts = await appAccountRepository(db).findEmployeeAccounts(
    { scannedAppIds: [], otherAppKinds: otherAppFindingKinds(directoryConnectors) },
    employeeIds,
    waiting.map(({ appId }) => appId),
  );
  const held = new Set(
    accounts
      .filter(({ status }) => status === "active")
      .map(({ employeeId, appId }) => `${employeeId}:${appId}`),
  );
  return waiting.flatMap((invite) => {
    // The repository reads the invites of these employees only.
    const id = `${invite.employeeId!}:${invite.appId}`;
    if (held.has(id)) {
      return [];
    }
    const row = { id, employeeId: invite.employeeId!, appId: invite.appId };
    return [
      { ...row, ...byHandInviteStateOf(invite), latestInvite: { ...invite, changesAhead: null } },
    ];
  });
}
