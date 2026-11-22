import { afterEach, vi } from "vitest";

import {
  approvedGoogleSetup,
  employeeServices,
  EMPLOYEE,
  expect,
  OWNER,
  test,
} from "#test/support";

test("reads directory status and current access in the requested employee order", async ({
  orm,
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

  const access = await service.readAccessOfEmployees(OWNER, [mia.id, ana.id]);

  expect(access).toEqual([
    {
      status: "active",
      currentAccess: [{ appName: "Slack", foundVia: ["google_sign_in"], since }],
      suspendedWithAccess: false,
    },
    {
      status: "suspended",
      currentAccess: [
        { appName: "Figma", foundVia: ["google_sign_in"], since },
        { appName: "Notion", foundVia: ["google_sign_in"], since },
        { appName: "Slack", foundVia: ["google_sign_in"], since },
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
        { appName: "Figma", foundVia: ["google_sign_in"], since },
        { appName: "Loom", foundVia: ["google_sign_in"], since },
        { appName: "Miro", foundVia: ["google_sign_in"], since },
        { appName: "Notion", foundVia: ["google_sign_in"], since },
        { appName: "Slack", foundVia: ["google_sign_in"], since },
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
