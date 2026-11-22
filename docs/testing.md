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

## The fake Google

Sign-in and the Google connector are tested against the fake Google in `packages/fake-apps`, seeded with the demo company Acme ([design](fake-apps.md)).

- API tests use the `fakeGoogle` fixture: a fresh fake on a free local port for each test. A test registers its server's redirect address, `<its origin>/api/google/callback`, with `POST /_fake/clients` (`registerGoogleRedirect`), and `consentAtGoogle` answers the consent page.
- End-to-end tests run against the `env` fixture's fake Google; `env.signInAsOwner()` connects Google Workspace as the seed's super admin, `admin@acme.example`, through the real consent, and leaves setup at the scan step.
- `pnpm dev` runs the fake beside the app on a free port and points the app's two Google settings at it. Restarting `pnpm dev` resets it.
- The seed's OAuth client secret is in `packages/fake-apps/src/seed/acme.ts`. Its redirect address under `pnpm dev` is `http://localhost:<app port>/api/google/callback`.

## The fake connectors container

The connectors container is faked in `packages/fake-apps` for `slack` and `linear`, with Acme's members ([design](fake-apps.md#fake-connectors-container)). It speaks the [connector contract](connector-contract.md), whose schemas and conformance suite are in `packages/connector-contract`.

- `pnpm dev` runs it as the Compose service `fake-connectors`. The API reaches it at `CONNECTORS_URL`, `http://fake-connectors:4000`; this machine reaches it on a free port of `127.0.0.1`, which `pnpm dev` prints as "Fake connectors (Acme)" with the Slack sign-in address. `HOST_FAKE_CONNECTORS_PORT` pins the port. Restarting `pnpm dev` resets it.
- API tests use the `fakeConnectors` fixture, and tests in `packages/fake-apps` the `connectors` fixture: a fresh fake on a free local port for each test, answering without delay.
- Each answer takes 250 ms by default, so a change's progress shows; `POST /_fake/delay` changes it.

Set `FAKE` to its address, such as `http://127.0.0.1:<printed port>`. The examples use Bash and `jq`.

### Linear

The key `lin_api_acme_fake` reaches Acme's Linear; any other key fails with `authentication_failed`.

```bash
LINEAR='{"connector":"linear","runtime":{"kind":"server"},"connection":{"settings":{},"secrets":{"apiKey":"lin_api_acme_fake"}}}'
curl -s "$FAKE/v1/connectors"
curl -s -H 'content-type: application/json' -d "$LINEAR" "$FAKE/v1/connections/test"
curl -s -H 'content-type: application/json' -d "$(jq -c '.cursor = null' <<<"$LINEAR")" "$FAKE/v1/accounts/list"
CHLOE=$(curl -s "$FAKE/_fake/state" | jq -c '.linear[] | select(.email == "chloe@acme.example") | {sourceKey, email}')
curl -s -H 'content-type: application/json' \
  -d "$(jq -c --argjson account "$CHLOE" '. + {action: "suspend", account: $account}' <<<"$LINEAR")" \
  "$FAKE/v1/actions/run"
```

### Slack

- In Chrome, open `http://slack.localhost:<printed port>/slack/signin`. The page shows "Sign in as Mia Novak" and signs Mia in at once: cookie `d` on `slack.localhost`, and Slack's token in local storage under `localConfig_v2`. `*.localhost` reaches this machine, so the cookie never mixes with the app's on `localhost`.
- Set `D` to the value of cookie `d` and `CONFIG` to the text of local storage `localConfig_v2`, from the browser's developer tools (Application) or with `agent-browser cookies get --json` and `agent-browser eval 'localStorage.getItem("localConfig_v2")'`. Without a browser, set both from one sign-in:

  ```sh
  PAGE=$(curl -si "$FAKE/slack/signin")
  D=$(printf '%s' "$PAGE" | sed -n 's/^set-cookie: d=\([^;]*\).*/\1/ip')
  CONFIG=$(printf '%s' "$PAGE" | sed -n 's/.*id="localConfig_v2">\(.*\)<\/script>.*/\1/p')
  ```

- The call carries them as the `appSession` secret, then works like Linear's above with `$SLACK` and a Slack member, such as Ana:

  ```bash
  SLACK=$(jq -nc --arg d "$D" --arg config "$CONFIG" '{connector: "slack", runtime: {kind: "server"},
    connection: {settings: {}, secrets: {appSession: {storage: {localConfig_v2: $config}, cookies: [{name: "d",
    value: $d, domain: "slack.localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax"}]}}}}')
  curl -s -H 'content-type: application/json' -d "$SLACK" "$FAKE/v1/connections/test"
  ANA=$(curl -s "$FAKE/_fake/state" | jq -c '.slack[] | select(.email == "ana@acme.example") | {sourceKey, email}')
  curl -s -H 'content-type: application/json' \
    -d "$(jq -c --argjson account "$ANA" '. + {action: "suspend", account: $account}' <<<"$SLACK")" \
    "$FAKE/v1/actions/run"
  ```

- The fake accepts only app sessions it issued since its last start, reset or session expiry. Its list has three pages: pass each `nextCursor` as the next `cursor`.
- Cookies ignore the port, so two checkouts signed in from one browser profile replace each other's `d` cookie: use a profile per checkout.

### Controls

They have no authentication, and answer HTTP 403 to requests that carry an `Origin` header, which browsers send with every cross-site POST.

```sh
curl -s -X POST "$FAKE/_fake/reset"
curl -s "$FAKE/_fake/state"
curl -s -X POST "$FAKE/_fake/linear/members/ana@acme.example/suspend"
curl -s -X POST "$FAKE/_fake/slack/members/elif@acme.example/reactivate"
curl -s -H 'content-type: application/json' "$FAKE/_fake/failures" \
  -d '{"connector": "slack", "call": "actions/run", "code": "not_allowed", "count": 1}'
curl -s -X POST "$FAKE/_fake/slack/sessions/expire"
curl -s -X POST "$FAKE/_fake/linear/keys/revoke"
curl -s -H 'content-type: application/json' -d '{"milliseconds": 5000}' "$FAKE/_fake/delay"
```

- `reset` puts back the seed: members, failures, the delay, the Linear key, and no Slack session.
- `state` lists each workspace's members with their status; pending invitations are not members.
- A member control changes the member as an admin would in the app.
- `failures` makes the next `count` calls of that connector and `call` (`connections/test`, `accounts/list` or `actions/run`) answer the contract error `code`.
- After `sessions/expire`, every Slack app session fails with `authentication_failed` until a new sign-in; after `keys/revoke`, the Linear key fails until `reset`.

### The conformance suite

```sh
pnpm --filter @broccoli-access/fake-apps test:e2e
```

It builds the fake's image (`packages/fake-apps/Dockerfile`, never part of the production image) and runs the suite against two containers of it, each with a read-only root file system. `pnpm test:e2e` includes it, so it needs Docker; CI runs it in the "Connector conformance" job. Another repository installs the package from a release tag and runs the same suite with its own fixtures:

```sh
pnpm add 'github:getbroccoli/broccoli-access#connector-contract-v1.1.0&path:packages/connector-contract'
```

pnpm sees this repository's `postinstall` in the downloaded archive and asks whether the package may run build scripts. It has none, so the consumer's `pnpm-workspace.yaml` answers no:

```yaml
allowBuilds:
  "@broccoli-access/connector-contract": false
```

```ts
// from "@broccoli-access/connector-contract/conformance"
const { urls, stop } = await startContainers("<image>");
afterAll(stop);
describeConnectorConformance({ urls, fixtures: [/* one ConnectorFixture per connector */] });
```

A fixture lists in `cannotCause` the errors its connector can never give, each with a one-line reason, such as `{ owner_browser_lost: "no owner_browser runtime" }`: only `blocked_by_check`, and `owner_browser_lost` for a connector without the `owner_browser` runtime. Their checks show as skipped with the reason (`--reporter=verbose` prints it). The fake causes every error, so its fixtures list none.

## The Chrome extension

`packages/extension` builds the extension to `packages/extension/dist`, which Chrome loads unpacked. Its ID is `pocgaplgfhgpfpgblaobjabmmgchhbld`, fixed by the manifest's `key`.

```sh
pnpm --filter @broccoli-access/extension build
```

Load it in its own Chromium profile, never in a profile in daily use. Chrome ignores `--load-extension` unless the `DisableLoadExtensionCommandLineSwitch` feature is turned off, and extensions need a headed browser, so give it a display (such as `Xvfb :121` and `DISPLAY=:121`). With agent-browser, set the whole launch in the environment and keep it the same for every call; a call without it starts the browser again without the extension:

```sh
export AGENT_BROWSER_HEADED=1
export AGENT_BROWSER_PROFILE="$(mktemp -d)"
export AGENT_BROWSER_EXTENSIONS="$PWD/packages/extension/dist"
# Newline-separated: a comma would split the feature list.
export AGENT_BROWSER_ARGS="--no-sandbox
--disable-features=Translate,DisableLoadExtensionCommandLineSwitch"
agent-browser open "$URL/settings/connections"
```

- Settings → Connections finds the extension by loading `chrome-extension://<id>/installed.txt`. Without it the "Chrome extension" card shows Not installed.
- "Pair this Chrome" opens the pair page in a small window, a tab for agent-browser (`agent-browser tab list`). The page clears its one-time code from the address as it opens. Its Pair button asks Chrome for access to the instance's origin in Chrome's own prompt, which is browser UI outside the page: answer it on the display, such as `xdotool key Tab Return` for Allow. Chrome remembers an allowed origin even after unpairing removes the access, so the prompt shows again only for an origin the profile never allowed; use a new profile to see it again.
- The extension's popup is `chrome-extension://<id>/popup.html`; open it in a tab to read or drive it.
- After code changes, build again, then turn on "Developer mode" in `chrome://extensions` and press the extension's Reload, or start with a new profile. Chrome reads the pages from `dist` when they open, but keeps running the old service worker, even across browser restarts.
