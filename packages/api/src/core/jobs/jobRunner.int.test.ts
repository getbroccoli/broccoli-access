import { EXAMPLE_JOB, expect, test as baseTest } from "#test/support";

import { createLogger } from "../logger";
import { createJobRunner, type JobRunner } from ".";

const test = baseTest.extend<{ runner: JobRunner }>({
  runner: async ({ databaseUrl }, use) => {
    const runner = createJobRunner(databaseUrl, createLogger("silent"), {
      retryDelaySeconds: 0,
      cronMonitorIntervalSeconds: 1,
    });
    try {
      await use(runner);
    } finally {
      await runner.stop();
    }
  },
});

test("runs a scheduled job with its payload on its schedule", async ({ runner }) => {
  const ran: (typeof EXAMPLE_JOB)[] = [];
  await runner.start([
    {
      "example.ran": {
        schedule: { cron: "* * * * * *", timeZone: "Europe/London", payload: EXAMPLE_JOB },
        run: (payload) => {
          ran.push(payload);
          return Promise.resolve();
        },
        onFailed: () => {
          throw new Error("The job should succeed");
        },
      },
    },
  ]);

  await expect.poll(() => ran, { timeout: 10_000 }).toContainEqual(EXAMPLE_JOB);
});

test("runs a job sent in a committed transaction once", async ({ runner, transact }) => {
  const ran: (typeof EXAMPLE_JOB)[] = [];
  await runner.start([
    {
      "example.ran": {
        run: (payload) => {
          ran.push(payload);
          return Promise.resolve();
        },
        onFailed: () => {
          throw new Error("The job should succeed");
        },
      },
    },
  ]);

  await transact((tx) => runner.queue.send(tx, "example.ran", EXAMPLE_JOB));

  await expect.poll(() => ran, { timeout: 5_000 }).toEqual([EXAMPLE_JOB]);
  await runner.stop();
  expect(ran).toEqual([EXAMPLE_JOB]);
});

test("never runs a job sent in a rolled-back transaction", async ({ runner, transact }) => {
  const ran: (typeof EXAMPLE_JOB)[] = [];
  await runner.start([
    {
      "example.ran": {
        run: (payload) => {
          ran.push(payload);
          return Promise.resolve();
        },
        onFailed: () => {
          throw new Error("The job should succeed");
        },
      },
    },
  ]);
  const rollback = new Error("Roll back");

  await expect(
    transact(async (tx) => {
      await runner.queue.send(tx, "example.ran", EXAMPLE_JOB);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  const committed = { id: "committed" };
  await transact((tx) => runner.queue.send(tx, "example.ran", committed));

  await expect.poll(() => ran, { timeout: 5_000 }).toContainEqual(committed);
  await runner.stop();
  expect(ran).toEqual([committed]);
});

test("calls onFailed with the payload after the third failed attempt", async ({
  runner,
  transact,
}) => {
  const attempts: (typeof EXAMPLE_JOB)[] = [];
  const failed: { payload: typeof EXAMPLE_JOB; attempts: number }[] = [];
  await runner.start([
    {
      "example.ran": {
        run: (payload) => {
          attempts.push(payload);
          return Promise.reject(new Error("Try again"));
        },
        onFailed: (payload) => {
          failed.push({ payload, attempts: attempts.length });
          return Promise.resolve();
        },
      },
    },
  ]);

  await transact((tx) => runner.queue.send(tx, "example.ran", EXAMPLE_JOB));

  await expect
    .poll(() => failed, { timeout: 15_000 })
    .toEqual([{ payload: EXAMPLE_JOB, attempts: 3 }]);
  expect(attempts).toEqual([EXAMPLE_JOB, EXAMPLE_JOB, EXAMPLE_JOB]);
});

test("stopping during startup waits for startup and leaves no worker running", async ({
  runner,
  databaseUrl,
  transact,
}) => {
  const stoppedRunnerJobs: (typeof EXAMPLE_JOB)[] = [];
  const lifecycle: string[] = [];
  const starting = runner
    .start([
      {
        "example.ran": {
          run: (payload) => {
            stoppedRunnerJobs.push(payload);
            return Promise.resolve();
          },
          onFailed: () => {
            throw new Error("The job should succeed");
          },
        },
      },
    ])
    .then(() => lifecycle.push("started"));

  const stopping = runner.stop().then(() => lifecycle.push("stopped"));
  await Promise.all([starting, stopping]);

  expect(lifecycle).toEqual(["started", "stopped"]);
  const secondRunner = createJobRunner(databaseUrl, createLogger("silent"));
  const ran: (typeof EXAMPLE_JOB)[] = [];
  try {
    await secondRunner.start([
      {
        "example.ran": {
          run: (payload) => {
            ran.push(payload);
            return Promise.resolve();
          },
          onFailed: () => {
            throw new Error("The job should succeed");
          },
        },
      },
    ]);
    await transact((tx) => secondRunner.queue.send(tx, "example.ran", EXAMPLE_JOB));

    await expect.poll(() => ran, { timeout: 5_000 }).toEqual([EXAMPLE_JOB]);
  } finally {
    await secondRunner.stop();
  }
  expect(stoppedRunnerJobs).toEqual([]);
});

test("runs jobs in order within a group while another group can run alongside", async ({
  runner,
  transact,
}) => {
  const releaseFirst = Promise.withResolvers<void>();
  const started: string[] = [];
  await runner.start([
    {
      "example.ran": {
        groupConcurrency: 1,
        run: async ({ id }) => {
          started.push(id);
          if (id === "first") await releaseFirst.promise;
        },
        onFailed: () => {
          throw new Error("The job should succeed");
        },
      },
    },
  ]);

  try {
    await transact((tx) =>
      runner.queue.send(tx, "example.ran", { id: "first" }, { group: "linear" }),
    );
    await expect.poll(() => started, { timeout: 8_000 }).toEqual(["first"]);
    for (const [id, group] of [
      ["second", "linear"],
      ["third", "linear"],
      ["other", "slack"],
    ] as const) {
      await transact((tx) => runner.queue.send(tx, "example.ran", { id }, { group }));
    }
    await expect.poll(() => started, { timeout: 8_000 }).toContain("other");
    expect(started).toEqual(["first", "other"]);
  } finally {
    releaseFirst.resolve();
  }

  await expect
    .poll(() => started, { timeout: 10_000 })
    .toEqual(["first", "other", "second", "third"]);
});

test("concurrent runners finish each waiting job in a group before starting the next", async ({
  runner,
  databaseUrl,
  transact,
}) => {
  const secondRunner = createJobRunner(databaseUrl, createLogger("silent"));
  const releaseWorkers = Promise.withResolvers<void>();
  const releaseFirst = Promise.withResolvers<void>();
  const started: string[] = [];
  const events: string[] = [];
  const handlers = [
    {
      "example.ran": {
        groupConcurrency: 1,
        run: async ({ id }: typeof EXAMPLE_JOB) => {
          started.push(id);
          if (id.startsWith("blocker-")) return releaseWorkers.promise;
          if (id === "other") return;
          events.push(`start ${id}`);
          if (id === "first") await releaseFirst.promise;
          events.push(`finish ${id}`);
        },
        onFailed: () => {
          throw new Error("The job should succeed");
        },
      },
    },
  ];
  const send = (id: string, group: string) =>
    transact((tx) => runner.queue.send(tx, "example.ran", { id }, { group }));

  try {
    await runner.start(handlers);
    await secondRunner.start(handlers);
    // Keep both workers on each runner busy until the whole group is waiting.
    const blockers = ["blocker-1", "blocker-2", "blocker-3", "blocker-4"];
    for (const id of blockers) await send(id, id);
    await expect.poll(() => started.length, { timeout: 8_000 }).toBe(blockers.length);
    await send("first", "linear");
    await send("second", "linear");
    await send("other", "slack");

    releaseWorkers.resolve();
    await expect
      .poll(() => started, { timeout: 8_000 })
      .toEqual(expect.arrayContaining(["first", "other"]));
    releaseFirst.resolve();
    await expect.poll(() => events.length, { timeout: 10_000 }).toBe(4);
    expect(events).toEqual(["start first", "finish first", "start second", "finish second"]);
  } finally {
    releaseWorkers.resolve();
    releaseFirst.resolve();
    await secondRunner.stop();
  }
});
