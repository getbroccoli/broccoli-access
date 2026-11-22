# @broccoli-access/connector-contract

The schemas of the [connector contract](https://github.com/getbroccoli/broccoli-access/blob/main/docs/connector-contract.md) and its conformance suite, for any connectors container.

## Install

From a release tag of this repository:

```sh
pnpm add 'github:getbroccoli/broccoli-access#connector-contract-v1.0.0&path:packages/connector-contract'
```

pnpm sees this repository's `postinstall` in the downloaded archive and asks whether the package may run build scripts. It has none, so answer no in your `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  "@broccoli-access/connector-contract": false
```

The package is TypeScript source: Vitest runs it and `tsc` checks it as it is, with no build step. It needs `vitest` 5 and Docker for the suite.

## Schemas

Zod schemas for each request and answer of the four calls, the manifest, the connection, the app session secret, runtimes and the error answer, with their types: `CONNECTOR_MANIFEST`, `CONNECTION_TEST_REQUEST`, `ACCOUNTS_LIST_ANSWER`, `CONNECTOR_ERROR_ANSWER`, `CONNECTOR_ERROR_CODES` and the rest in `src/index.ts`.

## Conformance suite

In a Vitest test file, start two containers of your image with a read-only root file system, then describe the suite with one fixture for each connector in the manifest. Each connector must list the `server` runtime, where the suite calls it:

```ts
import { describeConnectorConformance, startContainers } from "@broccoli-access/connector-contract";
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
        /* put the fake app back to its seed */
      },
    },
  ],
});
```

It checks every item under "Conformance" in the contract: each answer matches its schema, each error uses a listed code, a repeated action changes the member once, an action reports the status read afterwards, an unlisted runtime gets HTTP 400, and both containers give the same answers apart from renewed secrets. Like the core, it starts each series of calls with a connection test and applies the connection updates answers carry.
