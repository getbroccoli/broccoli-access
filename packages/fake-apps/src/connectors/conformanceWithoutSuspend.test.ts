import { describeConnectorConformance } from "@broccoli-access/connector-contract/conformance";
import { afterAll, describe } from "vitest";

import { NOTION_CONNECTION, startNotionConnector, type NotionAction } from "#test/support";

for (const scenario of [
  { name: "list only", actions: [], ownMember: null },
  {
    name: "invite and remove with a connection member",
    actions: ["invite", "remove"],
    ownMember: "david@acme.example",
  },
  {
    name: "invite and remove without a connection member",
    actions: ["invite", "remove"],
    ownMember: null,
  },
  { name: "remove only", actions: ["remove"], ownMember: null },
] satisfies { name: string; actions: NotionAction[]; ownMember: string | null }[]) {
  const first = await startNotionConnector(scenario.actions, scenario.ownMember);
  const second = await startNotionConnector(scenario.actions, scenario.ownMember);
  const servers = new Map([first, second].map((server) => [server.url, server]));
  afterAll(() => Promise.all([first.stop(), second.stop()]));
  describe(scenario.name, () => {
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
