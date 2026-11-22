import { expect, SYSTEM, test, instances, owners } from "#test/support";

import { user } from "../../auth";
import { ormOf, type Tx } from "../../db";

test("creates the owner for the holder, completes setup and ends the session", async ({
  orm,
  seed,
  transact,
}) => {
  await seed.setupStep("owner");
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });
  const owner = await transact((tx) =>
    owners.createOwnerAtSetup(
      SYSTEM,
      tx,
      {
        token: "setup-token",
        now: new Date("2026-01-02T12:00:00Z"),
      },
      () => insertOwner(tx),
    ),
  );

  expect(await instances.readInstance(orm)).toMatchObject({
    ownerUserId: owner.user.id,
    step: "done",
  });
  expect((await instances.readInstance(orm)).setupSession).toBeNull();
});

test.for([null, "another-token"])(
  "refuses owner creation with token %s and creates no user",
  async (token, { orm, seed, transact }) => {
    await seed.setupStep("owner");
    await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });

    await expect(
      transact((tx) =>
        owners.createOwnerAtSetup(
          SYSTEM,
          tx,
          {
            token,
            now: new Date("2026-01-02T12:00:00Z"),
          },
          () => insertOwner(tx),
        ),
      ),
    ).rejects.toMatchObject({ name: "SetupInProgressError" });

    expect(await orm.select().from(user)).toEqual([]);
    expect(await instances.readInstance(orm)).toMatchObject({ ownerUserId: null, step: "owner" });
  },
);

test("refuses owner creation with an expired setup session", async ({ orm, seed, transact }) => {
  const now = new Date("2026-01-04T12:00:00Z");
  await seed.setupStep("owner");
  await seed.setupSession({ expiresAt: now });

  await expect(
    transact((tx) =>
      owners.createOwnerAtSetup(
        SYSTEM,
        tx,
        {
          token: "setup-token",
          now,
        },
        () => insertOwner(tx),
      ),
    ),
  ).rejects.toMatchObject({ name: "SetupInProgressError" });

  expect(await orm.select().from(user)).toEqual([]);
});

test("refuses owner creation once setup is done", async ({ orm, seed, transact }) => {
  await seed.setupStep("done");
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });

  await expect(
    transact((tx) =>
      owners.createOwnerAtSetup(
        SYSTEM,
        tx,
        {
          token: "setup-token",
          now: new Date("2026-01-02T12:00:00Z"),
        },
        () => insertOwner(tx),
      ),
    ),
  ).rejects.toMatchObject({ code: "CONFLICT", message: "Setup is already done." });

  expect(await orm.select().from(user)).toEqual([]);
});

test("keeps one owner when two creations arrive together", async ({ orm, seed, transact }) => {
  await seed.setupStep("owner");
  await seed.setupSession({ expiresAt: new Date("2026-01-04T12:00:00Z") });
  const credential = { token: "setup-token", now: new Date("2026-01-02T12:00:00Z") };

  const results = await Promise.allSettled([
    transact((tx) =>
      owners.createOwnerAtSetup(SYSTEM, tx, credential, () => insertOwner(tx, "owner-1")),
    ),
    transact((tx) =>
      owners.createOwnerAtSetup(SYSTEM, tx, credential, () => insertOwner(tx, "owner-2")),
    ),
  ]);

  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(results.filter(({ status }) => status === "rejected")).toMatchObject([
    { reason: { name: "OwnerExistsError" } },
  ]);
  const users = await orm.select().from(user);
  expect(users).toHaveLength(1);
  expect(await instances.readInstance(orm)).toMatchObject({
    ownerUserId: users[0]!.id,
    step: "done",
  });
});

async function insertOwner(tx: Tx, id = "owner-1") {
  const owner = { id, name: "Owner", email: `${id}@example.com` };
  await ormOf(tx).insert(user).values(owner);
  return { user: owner };
}
