import type { Orm, Tx } from "../../../core/db";
import { accountChangeRepository } from "../db";
import type { AccountFacts } from "./accountFacts";
import { type AccountChangeState, withPlace } from "./accountChangeService";

/** What each account's row shows of Disable and Enable, by account id, from the facts read for it. */
export async function changeStatesOf(
  db: Orm | Tx,
  facts: ReadonlyMap<string, AccountFacts>,
): Promise<Map<string, AccountChangeState>> {
  const running = [...facts.values()].flatMap(({ latest }) =>
    latest?.status === "running" ? [latest.id] : [],
  );
  const ahead = running.length
    ? await accountChangeRepository(db).countChangesAhead(running)
    : new Map<string, number>();
  return new Map(
    [...facts].map(
      ([id, { isConnectionUser, latest, offered, offersRemove, reconnectOffered }]) => [
        id,
        {
          isConnectionUser,
          offeredChange: offered,
          offersRemove,
          offersReconnect: reconnectOffered,
          latestChange: latest && withPlace(latest, ahead),
        },
      ],
    ),
  );
}
