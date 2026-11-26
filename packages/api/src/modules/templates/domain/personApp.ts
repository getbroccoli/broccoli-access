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
  /**
   * `app_not_connected`: they should have it, but the app has no connection and no account of theirs is
   * known, so whether they lack it is unknown.
   */
  state: "active" | "suspended" | "missing" | "app_not_connected" | "invited" | "extra" | null;
}

export interface EmployeeAppChoice {
  employeeId: string;
  appId: string;
  choice: "to_review" | "added" | "removed" | "role_picked";
  role: string | null;
}

export interface PersonAppFacts {
  templates: readonly Template[];
  choices: readonly EmployeeAppChoice[];
  accounts: readonly { appId: string; status: AccountStatus }[];
  invites: readonly { appId: string; invitedAt: Date | null }[];
  listedApps: ReadonlySet<string>;
  /** The apps a connection reads, among those the person should have. */
  connectedApps: ReadonlySet<string>;
  /** The directory's app, such as Google Workspace; null before it is connected. */
  directoryAppId: string | null;
}

export function expectsApp(templateGivesIt: boolean, choice?: EmployeeAppChoice["choice"]) {
  return choice === "added" || (templateGivesIt && choice !== "removed");
}

/**
 * Why unexpected active access belongs on the workspace board; never for the directory's account,
 * which every person keeps whatever their templates.
 */
export function extraAppReason(
  choice: EmployeeAppChoice["choice"] | undefined,
  listed: boolean,
  isDirectory: boolean,
) {
  if (isDirectory) return null;
  if (choice === "to_review") return "review";
  if (!listed) return null;
  return choice === "removed" ? "removed" : "outside_templates";
}

/** Combines assignments, choices and actual access once per app, including apps only offering Invite. */
export function appsOfPerson(facts: PersonAppFacts): PersonApp[] {
  const sources = sourcesOf(facts.templates);
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
    const expected = expectsApp(templates.length > 0, choice?.choice);
    const invite = invites.get(appId);
    if (!expected && !account && !invite && !ownChoice) continue;
    const isDirectory = appId === facts.directoryAppId;
    const listed = facts.templates.length > 0 && facts.listedApps.has(appId);
    // A removal whose template is gone still says the owner did not want this app for them.
    const extra =
      (!isDirectory && choice?.choice === "removed") ||
      extraAppReason(choice?.choice, listed, isDirectory) !== null;
    const state = appState({
      expected,
      account,
      invited: !!invite?.invitedAt,
      extra,
      connected: facts.connectedApps.has(appId),
    });
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

/** Each app the templates give, with those templates and the roles they give it with. */
function sourcesOf(templates: readonly Template[]) {
  const sources = new Map<string, { templates: Template[]; roles: Set<string | null> }>();
  for (const template of templates) {
    for (const { appId, role } of template.apps) {
      const giving = sources.get(appId) ?? { templates: [], roles: new Set<string | null>() };
      giving.templates.push(template);
      giving.roles.add(role);
      sources.set(appId, giving);
    }
  }
  return sources;
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
  connected,
}: {
  expected: boolean;
  account: AccountStatus | undefined;
  invited: boolean;
  extra: boolean;
  connected: boolean;
}): PersonApp["state"] {
  if (account === "active") return !expected && extra ? "extra" : "active";
  if (invited) return "invited";
  if (expected) return connected || account ? "missing" : "app_not_connected";
  return account ?? null;
}
