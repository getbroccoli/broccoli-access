import { sql } from "drizzle-orm";

import { expect, test, extensionPairings, type TestSeed } from "#test/support";
import type { Orm } from "../../../core/db";

test("stores only the token hash for a pairing", async ({ orm, seed }) => {
  const { token, owner } = await pairedChrome(orm, seed);

  const { rows } = await orm.execute<{ token_hash: string }>(sql`
    select token_hash from extension_pairings where user_id = ${owner.user!.userId}
  `);

  expect(rows).toHaveLength(1);
  expect(rows[0]!.token_hash).toMatch(/\S/);
  expect(rows[0]!.token_hash).not.toContain(token);
  const separator = token.indexOf(".");
  expect(separator).toBeGreaterThan(0);
  expect(rows[0]!.token_hash).not.toContain(token.slice(separator + 1));
});

test("pairing again replaces the browser and its token", async ({ orm, seed }) => {
  const { owner, pairings, token } = await pairedChrome(orm, seed);
  const { code } = await pairings.startPairing(owner, { now: LATER });

  const replacement = await pairings.redeemCode({ code, browser: "Chrome on Linux", now: LATER });

  const current = await pairings.readPairing(owner);
  expect(current).toMatchObject({ browser: "Chrome on Linux", pairedAt: LATER });
  expect(await pairings.readPairingOfToken({ token, now: LATER })).toBeNull();
  expect(await pairings.readPairingOfToken({ token: replacement.token, now: LATER })).toEqual(
    current,
  );
  const { rows } = await orm.execute(
    sql`select id from extension_pairings where user_id = ${owner.user!.userId}`,
  );
  expect(rows).toHaveLength(1);
});

test("reading with the token updates the last seen time", async ({ orm, seed }) => {
  const { owner, pairings, token } = await pairedChrome(orm, seed);

  const pairing = await pairings.readPairingOfToken({ token, now: LATER });

  expect(pairing).toMatchObject({ pairedAt: NOW, lastSeenAt: LATER });
  expect(await pairings.readPairing(owner)).toEqual(pairing);
});

test.for(["", "x", "not-a-uuid.secret", "af46b36e-db20-4daa-b4be-a053de457111.unknown"])(
  "finds no pairing for token %j",
  async (token, { orm }) => {
    expect(await extensionPairings(orm).readPairingOfToken({ token, now: NOW })).toBeNull();
  },
);

test("unpairing as the owner revokes the token and removes the pairing", async ({ orm, seed }) => {
  const { owner, pairings, token } = await pairedChrome(orm, seed);

  await pairings.unpair(owner);

  expect(await pairings.readPairingOfToken({ token, now: LATER })).toBeNull();
  expect(await pairings.readPairing(owner)).toBeNull();
});

test("unpairing with the token removes the owner's pairing", async ({ orm, seed }) => {
  const { owner, pairings, token } = await pairedChrome(orm, seed);

  expect(await pairings.unpairWithToken(token)).toBe(true);
  expect(await pairings.readPairing(owner)).toBeNull();
});

test("unpairing with an unknown token leaves the pairing in place", async ({ orm, seed }) => {
  const { owner, pairings } = await pairedChrome(orm, seed);

  expect(await pairings.unpairWithToken("unknown")).toBe(false);
  expect(await pairings.readPairing(owner)).not.toBeNull();
});

const NOW = new Date("2026-11-22T10:00:00Z");
const LATER = new Date("2026-11-22T11:00:00Z");

async function pairedChrome(orm: Orm, seed: TestSeed) {
  const owner = await seed.owner();
  const pairings = extensionPairings(orm);
  const { code } = await pairings.startPairing(owner, { now: NOW });
  const { token } = await pairings.redeemCode({ code, browser: "Chrome on macOS", now: NOW });
  return { owner, pairings, token };
}
