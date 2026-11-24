import type { AccountStatus } from "../../../core/connectors";
import type { Template } from "./template";

/** A single app on a person's page, with every template that gives it. */
export interface PersonApp {
  appId: string;
  templates: Template[];
  role: string | null;
  state: "active" | "suspended" | "missing" | "invited" | "extra" | null;
}

export interface EmployeeAppChoice {
  employeeId: string;
  appId: string;
  choice: "to_review" | "added" | "removed" | "role_picked";
  role: string | null;
}

interface PersonAppFacts {
  templates: readonly Template[];
  choices: readonly EmployeeAppChoice[];
  accounts: readonly { appId: string; status: AccountStatus }[];
  invites: readonly { appId: string; invitedAt: Date | null }[];
  listedApps: ReadonlySet<string>;
}

/** Combines assignments, choices and actual access once per app, including apps only offering Invite. */
export function appsOfPerson(facts: PersonAppFacts): PersonApp[] {
  const sources = new Map<string, Template[]>();
  for (const template of facts.templates) {
    for (const { appId } of template.apps) {
      const giving = sources.get(appId) ?? [];
      giving.push(template);
      sources.set(appId, giving);
    }
  }
  const choices = new Map(facts.choices.map((choice) => [choice.appId, choice]));
  const accounts = new Map<string, AccountStatus>();
  for (const { appId, status } of facts.accounts) {
    if (accounts.get(appId) !== "active") accounts.set(appId, status);
  }
  const invites = new Map(facts.invites.map((invite) => [invite.appId, invite]));
  const ids = new Set([
    ...sources.keys(),
    ...choices.keys(),
    ...accounts.keys(),
    ...invites.keys(),
  ]);
  const rows: PersonApp[] = [];
  for (const appId of ids) {
    const templates = sources.get(appId) ?? [];
    const choice = choices.get(appId);
    const expected =
      choice?.choice === "added" || (templates.length > 0 && choice?.choice !== "removed");
    const account = accounts.get(appId);
    const invite = invites.get(appId);
    if (!expected && !account && !invite) continue;
    const extra =
      choice?.choice === "to_review" || (facts.templates.length > 0 && facts.listedApps.has(appId));
    const state = appState({ expected, account, invited: !!invite?.invitedAt, extra });
    rows.push({ appId, templates, role: choice?.role ?? null, state });
  }
  return rows;
}

function appState({
  expected,
  account,
  invited,
  extra,
}: {
  expected: boolean;
  account: AccountStatus | undefined;
  invited: boolean;
  extra: boolean;
}): PersonApp["state"] {
  if (account === "active") return !expected && extra ? "extra" : "active";
  if (invited) return "invited";
  if (expected) return "missing";
  return account ?? null;
}
