import { EXAMPLE_PAYLOAD, expect, fileStorage, storedFileIds, test } from "#test/support";

import { createEventBus, type PublishedEvent } from "../events";
import { createLogger } from "../logger";
import { createBeforeCommitBus, type Orm, transactor, type Tx } from ".";
import { MAX_BEFORE_COMMIT_ROUNDS } from "./transaction";

test("a transaction starts at hop zero by default", async ({ transact }) => {
  const hop = await transact((tx) => Promise.resolve(tx.hop));

  expect(hop).toBe(0);
});

test("a transaction carries the hop given to transact", async ({ transact }) => {
  const hop = await transact((tx) => Promise.resolve(tx.hop), { hop: 7 });

  expect(hop).toBe(7);
});

test("dispatches queued events after the write commits", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  const fileCounts: number[] = [];
  eventBus.subscribe({
    "example.happened": async (payload) => {
      received.push(payload);
      fileCounts.push(await storedFileCount(orm));
    },
  });

  await transact(async (tx) => {
    await storeExampleFile(tx);
    tx.publish("example.happened", EXAMPLE_PAYLOAD);
    expect(received).toEqual([]);
  });

  expect(received).toEqual([EXAMPLE_PAYLOAD]);
  expect(fileCounts).toEqual([1]);
});

test("rolls back the write and drops queued events when work fails", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  const received: unknown[] = [];
  eventBus.subscribe({
    "example.happened": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  await expect(
    transact(async (tx) => {
      await storeExampleFile(tx);
      tx.publish("example.happened", EXAMPLE_PAYLOAD);
      throw new Error("Work failed");
    }),
  ).rejects.toThrow("Work failed");

  expect(await storedFileCount(orm)).toBe(0);
  expect(received).toEqual([]);
});

test("refuses to use a transaction after it has ended", async ({ orm, transact }) => {
  const tx = await transact((tx) => Promise.resolve(tx));

  expect(() => tx.publish("example.happened", EXAMPLE_PAYLOAD)).toThrow(
    "The transaction has ended",
  );
  await expect(storeExampleFile(tx)).rejects.toThrow("The transaction has ended");
  expect(await storedFileCount(orm)).toBe(0);
});

test("refuses the publisher's transaction inside an after-commit handler", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));
  const transact = transactor(orm, eventBus);
  let rejection: unknown;

  await transact((retainedTx) => {
    eventBus.subscribe({
      "example.happened": async () => {
        try {
          await storeExampleFile(retainedTx);
        } catch (error) {
          rejection = error;
        }
      },
    });
    retainedTx.publish("example.happened", EXAMPLE_PAYLOAD);
    return Promise.resolve();
  });

  expect(rejection).toEqual(new Error("The transaction has ended"));
  expect(await storedFileCount(orm)).toBe(0);
});

test("hands identified events to handlers before committing their writes with the work", async ({
  orm,
}) => {
  const beforeCommit = createBeforeCommitBus();
  const transact = transactor(orm, createEventBus(createLogger("silent")), beforeCommit);
  const received: PublishedEvent[] = [];
  beforeCommit.subscribe(async (tx, events) => {
    received.push(...events);
    expect(await storedFileCount(orm)).toBe(0);
    expect(await storedFileCount(tx)).toBe(1);
    await storeExampleFile(tx);
  });

  await transact(async (tx) => {
    await storeExampleFile(tx);
    tx.publish("example.happened", EXAMPLE_PAYLOAD);
    tx.publish("example.happened", { id: "example-2" });
  });

  expect(received).toEqual([
    { id: expect.any(String) as unknown, type: "example.happened", payload: EXAMPLE_PAYLOAD },
    { id: expect.any(String) as unknown, type: "example.happened", payload: { id: "example-2" } },
  ]);
  expect(received[0]!.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  expect(received[1]!.id).not.toBe(received[0]!.id);
  expect(await storedFileCount(orm)).toBe(2);
});

test("delivers handler-published events in the next round and after the commit", async ({
  orm,
}) => {
  const eventBus = createEventBus(createLogger("silent"));
  const beforeCommit = createBeforeCommitBus();
  const transact = transactor(orm, eventBus, beforeCommit);
  const rounds: (readonly PublishedEvent[])[] = [];
  const received: unknown[] = [];
  beforeCommit.subscribe((tx, events) => {
    rounds.push(events);
    expect(received).toEqual([]);
    if (
      events.some(
        (event) => event.type === "example.happened" && event.payload.id === EXAMPLE_PAYLOAD.id,
      )
    ) {
      tx.publish("example.happened", { id: "from-handler" });
    }
    return Promise.resolve();
  });
  eventBus.subscribe({
    "example.happened": async (payload) => {
      expect(await storedFileCount(orm)).toBe(1);
      received.push(payload);
    },
  });

  await transact(async (tx) => {
    await storeExampleFile(tx);
    tx.publish("example.happened", EXAMPLE_PAYLOAD);
  });

  expect(rounds).toMatchObject([
    [{ type: "example.happened", payload: EXAMPLE_PAYLOAD }],
    [{ type: "example.happened", payload: { id: "from-handler" } }],
  ]);
  expect(received).toEqual([EXAMPLE_PAYLOAD, { id: "from-handler" }]);
});

test("rolls back the work and delivers no events when a before-commit handler fails", async ({
  orm,
}) => {
  const eventBus = createEventBus(createLogger("silent"));
  const beforeCommit = createBeforeCommitBus();
  const transact = transactor(orm, eventBus, beforeCommit);
  const received: unknown[] = [];
  const failure = new Error("Cannot start the work");
  eventBus.subscribe({
    "example.happened": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });
  beforeCommit.subscribe(async (tx) => {
    await storeExampleFile(tx);
    tx.publish("example.happened", { id: "from-handler" });
    throw failure;
  });

  await expect(
    transact(async (tx) => {
      await storeExampleFile(tx);
      tx.publish("example.happened", EXAMPLE_PAYLOAD);
    }),
  ).rejects.toBe(failure);

  expect(await storedFileCount(orm)).toBe(0);
  expect(received).toEqual([]);
});

test("rolls back events that keep publishing after ten before-commit rounds", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));
  const beforeCommit = createBeforeCommitBus();
  const transact = transactor(orm, eventBus, beforeCommit);
  const received: unknown[] = [];
  const rounds: (readonly PublishedEvent[])[] = [];
  eventBus.subscribe({
    "example.happened": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });
  beforeCommit.subscribe((tx, events) => {
    rounds.push(events);
    tx.publish("example.happened", EXAMPLE_PAYLOAD);
    return Promise.resolve();
  });

  await expect(
    transact(async (tx) => {
      await storeExampleFile(tx);
      tx.publish("example.happened", EXAMPLE_PAYLOAD);
    }),
  ).rejects.toThrow("Events kept publishing more events before the commit after 10 rounds.");

  expect(rounds).toHaveLength(MAX_BEFORE_COMMIT_ROUNDS);
  expect(rounds).toHaveLength(10);
  expect(await storedFileCount(orm)).toBe(0);
  expect(received).toEqual([]);
});

function storeExampleFile(tx: Tx): Promise<string> {
  return fileStorage.storeFile(tx, { content: Buffer.from("example"), mimeType: "text/plain" });
}

async function storedFileCount(db: Orm | Tx): Promise<number> {
  return (await storedFileIds(db)).length;
}
