import { startFakeConnectors } from "./connectors";

// Runs the fake connectors container for `pnpm dev` and the conformance suite's image; a
// restart resets it to the seed. Every interface of its own container, on the contract's port.
await startFakeConnectors({
  host: "0.0.0.0",
  port: 4000,
  log: (line) => process.stdout.write(`${line}\n`),
});
