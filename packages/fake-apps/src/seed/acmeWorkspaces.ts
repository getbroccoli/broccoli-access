import { ACME } from "./acme";
import type { SeedPerson } from "./acmeSeed";

/** Acme's workspace in an app behind the fake connectors container, fixed for every start. */
export interface SeedWorkspace {
  /** The workspace's name, which a connection test returns as the organisation's. */
  name: string;
  /** The settings a connection test returns, which later calls check. */
  settings: Record<string, string>;
  members: SeedMember[];
  /** The emails of its pending invitations, which are not members. */
  invitations: string[];
  /** The app's id for the member at this position, so one who joins later gets the next. */
  memberId: (index: number) => string;
}

export interface SeedMember {
  /** The app's own id for the member. */
  sourceKey: string;
  email: string;
  displayName: string;
  status: "active" | "suspended";
  /** One of the roles its connector lists. */
  role: string;
  /** The member whose session or key the seeded connection uses. */
  isConnectionUser: boolean;
}

/** The role, in Slack and in Linear, that may change other members. */
export const ADMIN_ROLE = "admin";

/** The secret the fake directory shows when the integration user's two-step sign-in is set up. */
export const INTEGRATION_USER_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

/** Someone Acme invited to Slack and Linear who has not joined yet. */
const NEW_HIRE_EMAIL = `new.hire@${ACME.customer.domain}`;

/**
 * Acme's Slack: the people the fake Google gives Slack and three accounts without a person, plus
 * one pending invitation.
 */
export const ACME_SLACK: SeedWorkspace = {
  name: ACME.customer.organizationName,
  settings: { teamId: "T04ACME", teamDomain: "acme", teamName: ACME.customer.organizationName },
  members: withIds(slackMemberId, [
    ...slackPeople().map((person) =>
      member(person, "member", person.email === `elif@${ACME.customer.domain}`),
    ),
    accountWithoutPerson("ana.ruiz@gmail.example", "Ana Ruiz", "member"),
    accountWithoutPerson("sam@agency.example", "Sam Lee", "member"),
    accountWithoutPerson(`reports@${ACME.customer.domain}`, "Reports bot", "member"),
  ]),
  invitations: [NEW_HIRE_EMAIL],
  memberId: slackMemberId,
};

/**
 * Acme's Linear: seven people, Hannah suspended, and one account without a person, plus one
 * pending invitation.
 */
export const ACME_LINEAR: SeedWorkspace & { apiKey: string } = {
  name: ACME.customer.organizationName,
  settings: {
    organizationId: "4a1c6f0e-8b2d-4e57-9c3a-5d0e7f1a2b3c",
    urlKey: "acme",
    organizationName: ACME.customer.organizationName,
  },
  members: withIds(linearUserId, [
    ...["admin", "ana", "chloe", "david", "gabriel", "jun", "hannah"].map((localPart) =>
      member(personWithLocalPart(localPart), "user", localPart === "hannah"),
    ),
    accountWithoutPerson(`deploys@${ACME.customer.domain}`, "Deploy bot", "user"),
  ]),
  invitations: [NEW_HIRE_EMAIL],
  memberId: linearUserId,
  apiKey: "lin_api_acme_fake",
};

type MemberWithoutId = Omit<SeedMember, "sourceKey">;

/** Each member's id comes from its position, so ids stay the same on every start. */
function withIds(memberId: (index: number) => string, members: MemberWithoutId[]): SeedMember[] {
  return members.map((each, index) => ({ sourceKey: memberId(index), ...each }));
}

/** Mia, the only super admin, is the admin who owns the Slack session and the Linear key. */
function member(person: SeedPerson, defaultRole: string, suspended: boolean): MemberWithoutId {
  return {
    email: person.email,
    displayName: `${person.givenName} ${person.familyName}`,
    status: suspended ? "suspended" : "active",
    role: person.isSuperAdmin ? ADMIN_ROLE : defaultRole,
    isConnectionUser: person.isSuperAdmin,
  };
}

/** An active account of nobody in Acme's directory: an outsider's, or a bot's. */
function accountWithoutPerson(email: string, displayName: string, role: string): MemberWithoutId {
  return { email, displayName, status: "active", role, isConnectionUser: false };
}

/** In the order of the fake Google's Slack grants, so member ids stay the same on every start. */
function slackPeople(): SeedPerson[] {
  const slack = ACME.apps.find((app) => app.name === "Slack");
  return ACME.grants
    .filter((grant) => grant.clientId === slack?.clientId)
    .map((grant) => personWithEmail(grant.email));
}

function personWithLocalPart(localPart: string): SeedPerson {
  return personWithEmail(`${localPart}@${ACME.customer.domain}`);
}

function personWithEmail(email: string): SeedPerson {
  const person = ACME.people.find((candidate) => candidate.email === email);
  if (person === undefined) throw new Error(`The Acme seed has no person ${email}`);
  return person;
}

function slackMemberId(index: number): string {
  return `U07ACME${String(index + 1).padStart(3, "0")}`;
}

/** UUID-shaped, as Linear's ids are. */
function linearUserId(index: number): string {
  return `d3a1f8e2-6b4c-4f1a-9e2d-${String(index + 1).padStart(12, "0")}`;
}
