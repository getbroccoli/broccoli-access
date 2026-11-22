import type { FakeConnector } from "./fakeConnector";
import { LINEAR } from "./linear";
import { SLACK } from "./slack";

/** Every connector the fake serves, in the manifest's order. */
export const FAKE_CONNECTORS: readonly FakeConnector[] = [SLACK, LINEAR];

export function findConnector(key: string): FakeConnector | undefined {
  return FAKE_CONNECTORS.find((connector) => connector.description.key === key);
}
