import {
  accountChanges,
  apps,
  expect,
  expectBlockedBy,
  failedDisable,
  googleScanWithLinearGrant,
  grantAtFakeGoogle,
  scannedLinear,
  recordHistory,
  withLockTimeout,
  holdBeforeCommit,
  OWNER,
  scans,
  storedApps,
  storedEmployeeAppChoices,
  storedEmployees,
  suspendAtFakeGoogle,
  SYSTEM,
  templateReviewTransactor,
  templates,
  test,
} from "#test/support";

test("a directory scan and a take-off for the same person both commit", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const email = "chloe@acme.example";
  const google = await googleScanWithLinearGrant(orm, fakeGoogle.url, email);
  const chloe = (await storedEmployees(orm)).find((person) => person.email === email)!;
  const linear = (await storedApps(orm)).find((app) => app.catalogKey === "linear")!;
  await apps(orm).approveApp(OWNER, linear.id);
  const template = await seed.template({ appIds: [linear.id] });
  await seed.employeeTemplate({
    templateId: template.id,
    employeeId: chloe.id,
    assignedBy: google.ownerUserId,
  });
  await suspendAtFakeGoogle(fakeGoogle.url, email);
  await google.scans.scanNow(OWNER, google.connectionId);
  const held = holdBeforeCommit(templateReviewTransactor(orm));
  const scan = scans(orm, { transact: held.transact, googleUrl: fakeGoogle.url });
  const saving = scan.runScan(SYSTEM, google.sourceId);
  const pid = await held.ready;

  const removing = templates(orm).takeOff(OWNER, { id: template.id, employeeId: chloe.id });
  try {
    await expectBlockedBy(orm, pid);
  } finally {
    held.release();
    await Promise.allSettled([saving, removing]);
  }

  await Promise.all([saving, removing]);
  expect(await scan.readScan(OWNER, google.connectionId)).toMatchObject({ status: "scanned" });
  expect(await storedEmployeeAppChoices(orm)).toMatchObject([
    { employeeId: chloe.id, appId: linear.id, choice: "to_review" },
  ]);
});

test("a directory metadata update and a multi-app take-off for someone outside the scan both commit", async ({
  orm,
  seed,
  fakeGoogle,
  fakeConnectors,
}) => {
  const google = await googleScanWithLinearGrant(orm, fakeGoogle.url, "chloe@acme.example");
  const person = await seed.employee({ email: "deploys@acme.example" });
  const linear = await scannedLinear(orm, fakeConnectors.url);
  const directoryId = (await apps(orm).directoryAppId(orm))!;
  const template = await seed.template({ appIds: [directoryId, linear.appId] });
  await seed.employeeTemplate({
    templateId: template.id,
    employeeId: person.id,
    assignedBy: google.ownerUserId,
  });
  const clientId = "linear-desktop";
  await grantAtFakeGoogle(fakeGoogle.url, {
    email: "chloe@acme.example",
    appName: "Linear",
    clientId,
  });
  await suspendAtFakeGoogle(fakeGoogle.url, "chloe@acme.example");
  await google.scans.scanNow(OWNER, google.connectionId);
  const held = holdBeforeCommit(templateReviewTransactor(orm));
  const scan = scans(orm, { transact: held.transact, googleUrl: fakeGoogle.url });
  const saving = scan.runScan(SYSTEM, google.sourceId);
  const pid = await held.ready;

  const removing = templates(orm).takeOff(OWNER, { id: template.id, employeeId: person.id });
  try {
    await expectBlockedBy(orm, pid, removing);
  } finally {
    held.release();
    await Promise.allSettled([saving, removing]);
  }

  await Promise.all([saving, removing]);
  expect((await storedApps(orm)).find(({ id }) => id === linear.appId)?.externalIds).toContain(
    `google:${clientId}`,
  );
  expect(await storedEmployeeAppChoices(orm)).toMatchObject([
    { employeeId: person.id, appId: linear.appId, choice: "to_review" },
  ]);
});

test("disabling one person's account clears its review while another person's take-off remains open", async ({
  orm,
  seed,
  fakeConnectors,
  transact,
}) => {
  const chloe = await seed.employee({ email: "chloe@acme.example" });
  const { owner, linear, change } = await failedDisable(orm, seed, fakeConnectors.url);
  const engineer = await seed.template({ appIds: [linear.appId] });
  const assignedBy = owner.user!.userId;
  await seed.employeeTemplate({ templateId: engineer.id, employeeId: chloe.id, assignedBy });
  await templates(orm).takeOff(owner, { id: engineer.id, employeeId: chloe.id });
  expect(await storedEmployeeAppChoices(orm)).toMatchObject([
    { employeeId: chloe.id, appId: linear.appId },
  ]);

  const ivan = await seed.employee();
  const slack = await seed.app({ status: "approved" });
  const designer = await seed.template({ appIds: [slack.id] });
  await seed.employeeTemplate({ templateId: designer.id, employeeId: ivan.id, assignedBy });
  await seed.appAccount({ employeeId: ivan.id, appId: slack.id });
  const held = holdBeforeCommit(transact);
  const removing = templates(orm, { transact: held.transact }).takeOff(owner, {
    id: designer.id,
    employeeId: ivan.id,
  });
  const review = templateReviewTransactor(orm);
  const changes = accountChanges(orm, {
    transact: withLockTimeout(review),
  });

  try {
    await held.ready;
    await changes.markChangeDoneByHand(owner, change.id);
    expect(await storedEmployeeAppChoices(orm)).toEqual([]);
  } finally {
    held.release();
    await removing;
  }
  const history = await recordHistory.read(orm, "employee", chloe.id, { first: 1 });
  expect(history.edges[0]?.node).toMatchObject({
    author: { kind: "SIGNED_IN_USER", id: owner.user!.userId },
    cause: { kind: "DONE_BY_HAND", ref: change.id },
    changes: [{ field: "appChoice", oldValue: linear.appId, newValue: null }],
  });
  expect(await storedEmployeeAppChoices(orm)).toMatchObject([
    { employeeId: ivan.id, appId: slack.id },
  ]);
});
