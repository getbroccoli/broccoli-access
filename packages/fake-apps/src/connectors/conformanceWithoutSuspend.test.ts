import type { ActionRunRequest } from "@broccoli-access/connector-contract";
import { describeConnectorConformance } from "@broccoli-access/connector-contract/conformance";
import { afterAll, describe, expect } from "vitest";

import { NOTION_CONNECTION, startNotionConnector, type NotionAction } from "#test/support";

const scenarios: {
  name: string;
  actions: NotionAction[];
  ownMember: string | null;
  onlySuspendedMember?: boolean;
  observeUnlistedRuntimeActions?: boolean;
}[] = [
  { name: "list only", actions: [], ownMember: null },
  {
    name: "invite only with one suspended member",
    actions: ["invite"],
    ownMember: null,
    onlySuspendedMember: true,
  },
  {
    name: "invite and remove with a connection member",
    actions: ["invite", "remove"],
    ownMember: "david@acme.example",
  },
  {
    name: "invite and remove without a connection member",
    actions: ["invite", "remove"],
    ownMember: null,
    observeUnlistedRuntimeActions: true,
  },
  { name: "remove only", actions: ["remove"], ownMember: null },
];

for (const scenario of scenarios) {
  const options = { onlySuspendedMember: scenario.onlySuspendedMember };
  const unlistedRuntimeActions = new Set<ActionRunRequest["action"]>();
  const first = await startNotionConnector(scenario.actions, scenario.ownMember, {
    ...options,
    onUnlistedRuntimeAction: scenario.observeUnlistedRuntimeActions
      ? (action) => unlistedRuntimeActions.add(action)
      : undefined,
  });
  const second = await startNotionConnector(scenario.actions, scenario.ownMember, options);
  const servers = new Map([first, second].map((server) => [server.url, server]));
  afterAll(() => Promise.all([first.stop(), second.stop()]));
  describe(scenario.name, () => {
    if (scenario.observeUnlistedRuntimeActions) {
      afterAll(() => expect(unlistedRuntimeActions).toEqual(new Set(["invite", "remove"])));
    }
    describeConnectorConformance({
      urls: [first.url, second.url],
      fixtures: [
        {
          connector: "notion",
          connection: () => Promise.resolve(NOTION_CONNECTION),
          ...(scenario.actions.includes("remove") && { memberToRemove: first.memberToRemove }),
          ...(scenario.actions.includes("invite") && {
            invitee: { email: "new.hire@acme.example" },
          }),
          reset: (url) => Promise.resolve(servers.get(url)!.reset()),
          causeError: (url, code) => servers.get(url)!.causeError(code),
        },
      ],
    });
  });
}
