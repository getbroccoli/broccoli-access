import { expect } from "vitest";

import { accountChanges as changesTable } from "../../src/modules/apps/db";
import { ownerHandOver } from "./containerConnections";
import { writableGoogleConnection } from "./googleWorkspaceConnector";
import { inviteTest } from "./inviteTest";
import { storedAppConnections } from "./storedGoogleConnection";
import { storedImportSources } from "./storedScan";
import { SYSTEM } from "./testSecurityContext";

/** A person offboarded with Google, Slack and Linear all disabled, ready for Remove all. */
export const offboardedTest = inviteTest.extend<{
  offboarded: { employeeId: string; email: string; slackAppId: string; slackConnectionId: string };
}>({
  offboarded: async ({ orm, fakeGoogle, fakeConnectors, workspace }, use) => {
    const { owner, service, employee, offboardingInput } = workspace;
    const { id: employeeId, email } = employee("chloe@acme.example");
    const slack = await ownerHandOver(orm, fakeConnectors, undefined, owner);
    const { connection } = await slack.service.connect(owner, {
      connector: "slack",
      appSession: slack.handOver.appSession,
      noticeAccepted: true,
    });
    const source = (await storedImportSources(orm)).find(
      (row) => row.connectionId === connection!.id,
    )!;
    await slack.scans.runScan(SYSTEM, source.id);
    const { appId } = (await storedAppConnections(orm)).find((row) => row.id === connection!.id)!;
    await writableGoogleConnection(orm, fakeGoogle.url, owner);
    await service.offboardEmployee(owner, await offboardingInput(employeeId));
    const disables = await orm.select().from(changesTable);
    expect(disables).toHaveLength(3);
    for (const change of disables) {
      await service.runChange(SYSTEM, change.id);
      expect(await service.readAccountChange(owner, change.id)).toMatchObject({
        status: "succeeded",
      });
    }
    await use({ employeeId, email, slackAppId: appId, slackConnectionId: connection!.id });
  },
});
