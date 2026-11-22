# @broccoli-access/connector-contract

The schemas of the [connector contract](https://github.com/getbroccoli/broccoli-access/blob/main/docs/connector-contract.md) and its conformance suite, for any connectors container.

## Install

From a release tag of this repository:

```sh
pnpm add 'github:getbroccoli/broccoli-access#connector-contract-v1.1.0&path:packages/connector-contract'
```

pnpm sees this repository's `postinstall` in the downloaded archive and asks whether the package may run build scripts. It has none, so answer no in your `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  "@broccoli-access/connector-contract": false
```

The package is TypeScript source: Vitest runs it and `tsc` checks it as it is, with no build step. The schemas come from the package itself; the suite, from `@broccoli-access/connector-contract/conformance`, needs `vitest` 5 and Docker.

## Schemas

Zod schemas for each request and answer of the four calls, the manifest, the connection, the app session secret, runtimes and the error answer, with their types: `CONNECTOR_MANIFEST`, `CONNECTION_TEST_REQUEST`, `ACCOUNTS_LIST_ANSWER`, `CONNECTOR_ERROR_ANSWER`, `CONNECTOR_ERROR_CODES` and the rest in `src/index.ts`.

## Conformance suite

In a Vitest test file, start two containers of your image with a read-only root file system, then describe the suite with one fixture for each connector in the manifest. Each connector must list the `server` runtime, where the suite calls it:

```ts
import {
  describeConnectorConformance,
  startContainers,
} from "@broccoli-access/connector-contract/conformance";
import { afterAll } from "vitest";

const { urls, stop } = await startContainers("<image>", { dockerArgs: ["--network", "<network>"] });
afterAll(stop);

describeConnectorConformance({
  urls,
  fixtures: [
    {
      connector: "linear",
      connection: async () => ({ settings: {}, secrets: { apiKey: "<key of the fake Linear>" } }),
      member: { sourceKey: "<an active member's id>", email: "<that member's email>" },
      causeError: async (url, code) => {
        /* make the next actions/run call through the container at url answer with code */
      },
      reset: async (url) => {
        /* put the fake app back to its seed: the member active, the credentials working, no error waiting */
      },
      cannotCause: {
        blocked_by_check: "an API connector meets no check",
        owner_browser_lost: "no owner_browser runtime",
      },
    },
  ],
});
```

It checks every item under "Conformance" in the contract: each answer matches its schema, each error the fixture causes comes back with its listed code (a check of the answer, not of how the connector meets that failure), a repeated action changes the member once, an action reports the status read afterwards, an unlisted runtime gets HTTP 400, and both containers give the same answers apart from renewed secrets. Like the core, it starts each series of calls with a connection test and applies the connection updates answers carry.

The fixture causes every error except those it lists in `cannotCause`, the errors its connector can never give, each with a one-line reason: `blocked_by_check`, which only a robot meets, and `owner_browser_lost`, for a connector without the `owner_browser` runtime. Their checks show as skipped, with the reason in the skip note (`vitest --reporter=verbose` prints it); the fixture's check of `cannotCause` fails for any other key, a blank or multi-line reason, or `owner_browser_lost` for a connector with that runtime. Since version 1.1.0.
