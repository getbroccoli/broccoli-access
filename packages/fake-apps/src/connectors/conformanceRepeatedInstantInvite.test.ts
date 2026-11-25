import type { ListedAccount } from "@broccoli-access/connector-contract";
import { describeConnectorConformance } from "@broccoli-access/connector-contract/conformance";
import { afterAll, beforeEach, describe, expect } from "vitest";

import { NOTION_CONNECTION, startNotionConnector } from "#test/support";

const invitee = { email: "new.hire@acme.example" };
const invalidRetries = [
  {
    name: "rejects a different member on retry",
    answer: (account: ListedAccount) => ({
      changed: false,
      account: { ...account, sourceKey: "different-member" },
    }),
    actual: "different-member",
    expected: `notion-${invitee.email}`,
  },
  {
    name: "rejects a changed answer on retry",
    answer: (account: ListedAccount) => ({ changed: true, account }),
    actual: "true",
    expected: "false",
  },
];

for (const { name, answer, actual, expected } of invalidRetries) {
  const notion = await startNotionConnector(["invite"], null, {
    instantInvite: true,
    existingMemberInvite: answer,
  });
  afterAll(notion.stop);

  describe(name, { fails: true }, () => {
    let errors: { actual?: unknown; expected?: unknown }[] | undefined;
    beforeEach(({ task, skip, onTestFailed }) => {
      if (!task.name.includes("when invite repeats")) skip();
      onTestFailed(({ task }) => {
        errors = task.result?.errors?.slice();
      });
    });
    afterAll(() => {
      expect(errors).toHaveLength(1);
      expect(errors?.[0]?.actual).toContain(actual);
      expect(errors?.[0]?.expected).toContain(expected);
    });
    describeConnectorConformance({
      urls: [notion.url, notion.url],
      fixtures: [
        {
          connector: "notion",
          connection: () => Promise.resolve(NOTION_CONNECTION),
          invitee,
          reset: () => Promise.resolve(notion.reset()),
          causeError: (_url, code) => notion.causeError(code),
        },
      ],
    });
  });
}
