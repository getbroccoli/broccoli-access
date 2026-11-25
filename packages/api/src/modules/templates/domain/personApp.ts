import type { AccountStatus } from "../../../core/connectors";
import type { Template } from "./template";

/** A single app on a person's page, with every template that gives it. */
export interface PersonApp {
  appId: string;
  templates: Template[];
  roleConflict: boolean;
  role: string | null;
  /** The owner's own choice for this person, while it changes what they get or marks an account. */
  choice: "added" | "removed" | null;
  accountStatus: AccountStatus | null;
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
  const sources = new Map<string, { templates: Template[]; roles: Set<string | null> }>();
  for (const template of facts.templates) {
    for (const { appId, role } of template.apps) {
      const giving = sources.get(appId) ?? { templates: [], roles: new Set<string | null>() };
      giving.templates.push(template);
      giving.roles.add(role);
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
    const source = sources.get(appId);
    const templates = source?.templates ?? [];
    const choice = choices.get(appId);
    const account = accounts.get(appId);
    const ownChoice = effectiveChoice(templates, choice, account);
    const expected = ownChoice === "added" || (templates.length > 0 && ownChoice !== "removed");
    const invite = invites.get(appId);
    if (!expected && !account && !invite && !ownChoice) continue;
    // A removal whose template is gone still says the owner did not want this app for them.
    const extra =
      choice?.choice === "to_review" ||
      choice?.choice === "removed" ||
      (facts.templates.length > 0 && facts.listedApps.has(appId));
    const state = appState({ expected, account, invited: !!invite?.invitedAt, extra });
    rows.push({
      appId,
      templates,
      ...personAppRole(source?.roles ?? new Set(), choice),
      choice: ownChoice,
      accountStatus: account ?? null,
      state,
    });
  }
  return rows;
}

/** A choice of default is as explicit as any other picked role. */
export function personAppRole(roles: ReadonlySet<string | null>, choice?: EmployeeAppChoice) {
  if (choice?.choice === "added" && !roles.size) return { role: choice.role, roleConflict: false };
  if (choice?.choice === "removed") return { role: null, roleConflict: false };
  if (roles.size < 2) return { role: roles.values().next().value ?? null, roleConflict: false };
  if (choice?.choice === "role_picked" && pickStillApplies(roles, choice.role)) {
    return { role: choice.role, roleConflict: false };
  }
  return { role: null, roleConflict: true };
}

/** A saved choice lasts only while its role belongs to a disagreement. */
export function pickStillApplies(roles: ReadonlySet<string | null>, role: string | null) {
  return roles.size > 1 && roles.has(role);
}

/**
 * An addition counts only while no template gives the app. A removal counts while one does, or
 * while it keeps an active account extra, so the owner can still undo it there.
 */
function effectiveChoice(
  templates: readonly Template[],
  choice: EmployeeAppChoice | undefined,
  account: AccountStatus | undefined,
) {
  if (choice?.choice === "added" && !templates.length) return "added";
  if (choice?.choice === "removed" && (templates.length || account === "active")) return "removed";
  return null;
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
