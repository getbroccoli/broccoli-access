# Testing

How we write tests in Broccoli Access. The decisions behind them are in [§8 of the architecture](architecture.md#8-testing).

## What to test

Three layers, most tests in the middle one:

- **Domain rules** with unit tests next to the code, named `<subject>.test.ts`. Domain code is pure, so these tests need no mocks.
- **Use cases** with integration tests next to them, named `<use-case>.int.test.ts`. They call the module's use-case factory directly against a real, migrated Postgres, with any security context built in the test (`OWNER`, `ADMIN`, `EMPLOYEE` or `SYSTEM`, or `signedIn(orm, …)` for a caller linked to an employee); application code never sees an anonymous caller. Permissions, validation, uniqueness, paging, transactions, audit and events are verified here. The `test` fixtures in `packages/api/test/support`, shared by all layers that need Postgres, give each test its own database (`orm`), a `seed`, and `transact` for transactions whose events nobody receives.
- **API wiring** with a few end-to-end tests under `packages/api/test/e2e`. They start the real server and call GraphQL over HTTP: the session becomes the security context and a request without one is refused, each operation reaches its use case once on the happy path, errors keep their format. Rules already covered by integration tests are not repeated here.
- **Bugs** with a test that reproduces the bug, written before the fix, at the lowest layer that shows it.

## What not to test

The rules are [RULE40 and RULE41](code-quality.md#tests). Two of them are choices for now: frontend components and pages get no tests, only pure frontend functions such as search-param parsing; and integrations (`src/integrations/`) are thin clients over shared helpers such as `fetchJson`, which have their own tests, so use-case tests replace them with a fake and end-to-end tests run them against a local fake service.

Do not write tests for log messages, fields or emission. Logs help diagnose problems; use useful identifiers and outcomes following [RULE31](code-quality.md#data-configuration-and-logs), and keep tests focused on application behaviour.

## Writing a test

- Work test-first: a failing test, the smallest code that passes, then refactor.
- Follow [RULE42 to RULE46](code-quality.md#tests); a name reads like `it("rejects a request that overlaps an approved absence")`.
- Build test data with `seed` (`TestSeed` in `packages/api/test/support`), which inserts through each module's repository, skipping use cases, permissions, audit and events. Seed values must be what the app would store (normalised, such as a lowercased email). Set only the fields the test is about. A module adds its own seed methods.
- Build the services under test with the module's helper in `#test/support`, such as `mailSettings(orm, { mail })`. It fills every dependency with a test default (a new event bus, a silent logger, no external calls), so a test passes only the one it is about and the factory call is not repeated in every test. A module whose factory needs more than `{ orm }` adds such a helper.
- Core tests publish the test-only `example.happened` domain event (`EXAMPLE_PAYLOAD`), never a module's event, so they do not depend on any module.
- Assert on outcomes a caller can see: return values, GraphQL responses, state read back through public queries, and emitted events.
- External systems such as email and third-party HTTP get fakes. The security contexts in `#test/support` are the real ones; `OWNER`, `ADMIN` and `EMPLOYEE` know no employees, so only grants on `all` reach anyone, and `signedIn(orm, { profiles, employeeId })` links the caller to an employee.
- Add property-based tests only when the module design agrees on them. They run the use cases against Postgres, never a copy of the logic inside the test, and live next to them as `<use-case>.pbt.test.ts`.

## Running integration and end-to-end tests

Both need Postgres. Start this checkout's throwaway instance, run the tests, and stop it when you are done:

```sh
docker compose up -d --wait postgres-test
pnpm test:integration
pnpm test:e2e
docker compose rm --stop --force postgres-test
```

Property tests run many random cases, so they run only during development, never in `pnpm check` or CI:

```sh
pnpm --filter @broccoli-access/api test:pbt
```

Load tests fill Postgres with a large workspace, such as 10,000 people with years of history, and check a run stays within its time. They live next to the code as `<use-case>.load.test.ts` and, like property tests, run only during development:

```sh
pnpm --filter @broccoli-access/api test:load
```

Each checkout gets its own container on a free port, so worktrees can run the tests at the same time. The data lives in memory; removing the container discards it, including databases left by an interrupted run. To use another Postgres server, set `TEST_DATABASE_URL` to an admin connection URL; the tests create and drop only databases named `broccoli_access_test_*`.
