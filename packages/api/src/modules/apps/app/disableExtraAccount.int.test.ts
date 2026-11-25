import { expect, inviteTest } from "#test/support";

inviteTest(
  "Disable from Differences queues a change for a current extra account",
  async ({ workspace: { service, owner, linear, employee, sent }, seed }) => {
    const chloe = employee("chloe@acme.example");
    const account = linear.account(chloe.email);
    await seed.employeeAppChoice({
      employeeId: chloe.id,
      appId: linear.appId,
      choice: "to_review",
    });

    const change = await service.changeAccount(owner, {
      appAccountId: account.id,
      action: "suspend",
      extraEmployeeId: chloe.id,
    });

    expect(change).toMatchObject({
      appAccountId: account.id,
      action: "suspend",
      status: "running",
    });
    expect(sent).toMatchObject([{ payload: { changeId: change.id } }]);
  },
);

inviteTest(
  "Disable from Differences refuses an account that a new assignment now gives",
  async ({ workspace: { service, owner, linear, employee, sent }, seed }) => {
    const chloe = employee("chloe@acme.example");
    const account = linear.account(chloe.email);
    const pair = { employeeId: chloe.id, appId: linear.appId };
    await seed.employeeAppChoice({ ...pair, choice: "to_review" });
    await seed.assignedTemplateApp({ ...pair, role: null, assignedBy: owner.user!.userId });

    await expect(
      service.changeAccount(owner, {
        appAccountId: account.id,
        action: "suspend",
        extraEmployeeId: chloe.id,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This account is no longer extra for this person.",
    });
    expect(sent).toEqual([]);
  },
);

inviteTest(
  "Disable from Differences refuses an account without a person",
  async ({ workspace: { service, owner, linear, ivan, sent } }) => {
    const account = linear.account("deploys@acme.example");

    await expect(
      service.changeAccount(owner, {
        appAccountId: account.id,
        action: "suspend",
        extraEmployeeId: ivan.id,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This account is no longer extra for this person.",
    });
    expect(sent).toEqual([]);
  },
);

inviteTest(
  "Disable refuses a confirmation for another person even when the current account is Extra",
  async ({ workspace: { service, owner, linear, employee, sent }, seed }) => {
    const chloe = employee("chloe@acme.example");
    const david = employee("david@acme.example");
    await seed.employeeAppChoice({
      employeeId: chloe.id,
      appId: linear.appId,
      choice: "to_review",
    });

    await expect(
      service.changeAccount(owner, {
        appAccountId: linear.account(chloe.email).id,
        action: "suspend",
        extraEmployeeId: david.id,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This account is no longer extra for this person.",
    });
    expect(sent).toEqual([]);
  },
);
