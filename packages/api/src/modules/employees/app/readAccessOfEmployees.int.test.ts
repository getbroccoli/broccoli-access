import { afterEach, vi } from "vitest";

import {
  approvedGoogleSetup,
  apps,
  employeeServices,
  EMPLOYEE,
  expect,
  OWNER,
  test,
} from "#test/support";

test("reads directory status and current access in the requested employee order", async ({
  orm,
  seed,
  fakeGoogle,
}) => {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  const since = { at: new Date(now - 180 * 86_400_000), before: true };
  await approvedGoogleSetup(orm, fakeGoogle.url);
  const service = employeeServices(orm);
  const { edges } = await service.listEmployees(OWNER, { first: 100 });
  const ana = edges.find(({ node }) => node.email === "ana@acme.example")!.node;
  const mia = edges.find(({ node }) => node.email === "admin@acme.example")!.node;

  const appService = apps(orm);
  const ignored = await appService.listApps(OWNER, { status: "ignored" });
  const asana = ignored.edges.find(({ node }) => node.name === "Asana")!.node;
  await appService.approveApp(OWNER, asana.id);
  await seed.appAccount({ appId: asana.id, employeeId: mia.id, grantedBefore: since.at });

  const access = await service.readAccessOfEmployees(OWNER, [mia.id, ana.id]);

  expect(access).toEqual([
    {
      status: "active",
      currentAccess: [
        { appName: "Asana", catalogKey: null, foundVia: ["google_sign_in"], since },
        { appName: "Slack", catalogKey: "slack", foundVia: ["google_sign_in"], since },
      ],
      suspendedWithAccess: false,
    },
    {
      status: "suspended",
      currentAccess: [
        { appName: "Figma", catalogKey: "figma", foundVia: ["google_sign_in"], since },
        { appName: "Notion", catalogKey: "notion", foundVia: ["google_sign_in"], since },
        { appName: "Slack", catalogKey: "slack", foundVia: ["google_sign_in"], since },
      ],
      suspendedWithAccess: true,
    },
  ]);
});

test("reads an active employee's current access without a suspended warning", async ({
  orm,
  fakeGoogle,
}) => {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  const since = { at: new Date(now - 180 * 86_400_000), before: true };
  await approvedGoogleSetup(orm, fakeGoogle.url);
  const service = employeeServices(orm);
  const { edges } = await service.listEmployees(OWNER, {
    filter: { search: "chloe@acme.example" },
  });
  const chloe = edges[0]!.node;

  const access = await service.readAccessOfEmployees(OWNER, [chloe.id]);

  expect(access).toEqual([
    {
      status: "active",
      currentAccess: [
        { appName: "Figma", catalogKey: "figma", foundVia: ["google_sign_in"], since },
        { appName: "Loom", catalogKey: "loom", foundVia: ["google_sign_in"], since },
        { appName: "Miro", catalogKey: "miro", foundVia: ["google_sign_in"], since },
        { appName: "Notion", catalogKey: "notion", foundVia: ["google_sign_in"], since },
        { appName: "Slack", catalogKey: "slack", foundVia: ["google_sign_in"], since },
      ],
      suspendedWithAccess: false,
    },
  ]);
});

test("reads no status or apps for an employee without accounts", async ({ orm, seed }) => {
  const employee = await seed.employee();

  const access = await employeeServices(orm).readAccessOfEmployees(OWNER, [employee.id]);

  expect(access).toEqual([{ status: null, currentAccess: [], suspendedWithAccess: false }]);
});

test("refuses to read employee access without MANAGE_WORKSPACE", async ({ orm, seed }) => {
  const employee = await seed.employee();

  await expect(
    employeeServices(orm).readAccessOfEmployees(EMPLOYEE, [employee.id]),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

afterEach(() => vi.restoreAllMocks());
