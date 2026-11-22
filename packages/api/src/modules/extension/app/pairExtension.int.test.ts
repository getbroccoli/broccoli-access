import {
  expect,
  test,
  EMPLOYEE,
  employeeDirectory,
  extensionPairings,
  type TestSeed,
} from "#test/support";
import type { Orm } from "../../../core/db";
import { PrincipalSecurityContext } from "../../../core/security";

test("records the trimmed browser and the time the owner pairs it", async ({ orm, seed }) => {
  const { pairings, owner, code } = await startedPairing(orm, seed);
  const now = new Date("2026-11-22T10:01:00Z");

  await pairings.redeemCode({ code, browser: "  Chrome on macOS  ", now });

  expect(await pairings.readPairing(owner)).toMatchObject({
    browser: "Chrome on macOS",
    pairedAt: now,
    lastSeenAt: now,
  });
});

test("refuses a code exactly five minutes after it was issued", async ({ orm, seed }) => {
  const { pairings, code } = await startedPairing(orm, seed);

  await expect(
    pairings.redeemCode({ code, browser: BROWSER, now: new Date("2026-11-22T10:05:00Z") }),
  ).rejects.toMatchObject(INVALID_CODE);
});

test("accepts a code one millisecond before it expires", async ({ orm, seed }) => {
  const { pairings, code } = await startedPairing(orm, seed);

  const result = await pairings.redeemCode({
    code,
    browser: BROWSER,
    now: new Date("2026-11-22T10:04:59.999Z"),
  });

  expect(result.token).toMatch(/\S/);
});

test("refuses a code used twice", async ({ orm, seed }) => {
  const { pairings, code } = await startedPairing(orm, seed);
  const input = { code, browser: BROWSER, now: START };
  await pairings.redeemCode(input);

  await expect(pairings.redeemCode(input)).rejects.toMatchObject(INVALID_CODE);
});

test("refuses a changed pairing code", async ({ orm, seed }) => {
  const { pairings, code } = await startedPairing(orm, seed);
  const middle = Math.floor(code.length / 2);
  const changed =
    code.slice(0, middle) + (code[middle] === "A" ? "B" : "A") + code.slice(middle + 1);

  await expect(
    pairings.redeemCode({ code: changed, browser: BROWSER, now: START }),
  ).rejects.toMatchObject(INVALID_CODE);
});

test("refuses a code the instance never issued", async ({ orm }) => {
  await expect(
    extensionPairings(orm).redeemCode({ code: "never-issued", browser: BROWSER, now: START }),
  ).rejects.toMatchObject(INVALID_CODE);
});

test("pairs only the admin who requested the code", async ({ orm, seed }) => {
  const owner = await seed.owner();
  const saved = await seed.user({ email: "admin@example.com" });
  const admin = PrincipalSecurityContext.user(
    {
      userId: saved.id,
      email: saved.email,
      isOwner: false,
      permissionProfiles: ["EMPLOYEE", "ADMIN"],
      employeeId: null,
    },
    employeeDirectory(orm),
  );
  const pairings = extensionPairings(orm);
  const { code } = await pairings.startPairing(admin, { now: START });

  await pairings.redeemCode({ code, browser: BROWSER, now: START });

  expect(await pairings.readPairing(admin)).toMatchObject({ userId: saved.id, browser: BROWSER });
  expect(await pairings.readPairing(owner)).toBeNull();
});

test.for(["  ", "x".repeat(101)])(
  "refuses an invalid browser label %j",
  async (browser, { orm, seed }) => {
    const { code, pairings } = await startedPairing(orm, seed);

    await expect(pairings.redeemCode({ code, browser, now: START })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: [{ field: "browser", code: "invalid" }],
    });
  },
);

test("refuses an employee starting a pairing", async ({ orm }) => {
  await expect(extensionPairings(orm).startPairing(EMPLOYEE, { now: START })).rejects.toMatchObject(
    { code: "FORBIDDEN" },
  );
});

test.for(["readPairing", "unpair"] as const)(
  "refuses an employee calling %s",
  async (operation, { orm }) => {
    await expect(extensionPairings(orm)[operation](EMPLOYEE)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  },
);

const START = new Date("2026-11-22T10:00:00Z");
const BROWSER = "Chrome on macOS";
const INVALID_CODE = { code: "INVALID_INPUT", fieldErrors: [{ field: "code", code: "invalid" }] };

async function startedPairing(orm: Orm, seed: TestSeed) {
  const owner = await seed.owner();
  const pairings = extensionPairings(orm);
  const { code } = await pairings.startPairing(owner, { now: START });
  return { pairings, owner, code };
}
