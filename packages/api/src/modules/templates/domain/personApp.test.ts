import { expect, test } from "vitest";

import { appsOfPerson } from "./personApp";
import type { Template } from "./template";

const APP = "00000000-0000-4000-8000-000000000001";
const EMPLOYEE = "00000000-0000-4000-8000-000000000002";
const ENGINEER: Template = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "Engineer",
  createdAt: new Date(0),
  peopleCount: 1,
  apps: [{ id: "00000000-0000-4000-8000-000000000004", appId: APP, role: null }],
};
const NOTHING = {
  templates: [],
  choices: [],
  accounts: [],
  invites: [],
  listedApps: new Set<string>(),
};
const choice = (made: "added" | "removed") => ({
  employeeId: EMPLOYEE,
  appId: APP,
  choice: made,
  role: null,
});

test("keeps a removed template app listed, as not given", () => {
  const rows = appsOfPerson({ ...NOTHING, templates: [ENGINEER], choices: [choice("removed")] });

  expect(rows).toMatchObject([{ appId: APP, choice: "removed", state: null }]);
});

test("an active account in a removed template app is extra", () => {
  const rows = appsOfPerson({
    ...NOTHING,
    templates: [ENGINEER],
    choices: [choice("removed")],
    accounts: [{ appId: APP, status: "active" }],
    listedApps: new Set([APP]),
  });

  expect(rows).toMatchObject([{ choice: "removed", state: "extra" }]);
});

test("a removal has no effect once no template gives the app", () => {
  const rows = appsOfPerson({ ...NOTHING, choices: [choice("removed")] });

  expect(rows).toEqual([]);
});

test("an added app that a template now gives comes from the template", () => {
  const rows = appsOfPerson({ ...NOTHING, templates: [ENGINEER], choices: [choice("added")] });

  expect(rows).toMatchObject([{ choice: null, state: "missing", templates: [ENGINEER] }]);
});
