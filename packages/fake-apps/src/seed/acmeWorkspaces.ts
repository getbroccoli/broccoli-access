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
  /** The member whose session or key the seeded connection uses. */
  isConnectionUser: boolean;
}

/** Someone Acme invited to Slack and Linear who has not joined yet. */
const NEW_HIRE_EMAIL = `new.hire@${ACME.customer.domain}`;

/** Acme's Slack: the people the fake Google gives Slack, plus one pending invitation. */
export const ACME_SLACK: SeedWorkspace = {
  name: ACME.customer.organizationName,
  settings: { teamId: "T04ACME", teamDomain: "acme", teamName: ACME.customer.organizationName },
  members: slackPeople().map((person, index) =>
    member(person, slackMemberId(index), person.email === `elif@${ACME.customer.domain}`),
  ),
  invitations: [NEW_HIRE_EMAIL],
  memberId: slackMemberId,
};

/** Acme's Linear: seven people, Hannah suspended, plus one pending invitation. */
export const ACME_LINEAR: SeedWorkspace & { apiKey: string } = {
  name: ACME.customer.organizationName,
  settings: {
    organizationId: "4a1c6f0e-8b2d-4e57-9c3a-5d0e7f1a2b3c",
    urlKey: "acme",
    organizationName: ACME.customer.organizationName,
  },
  members: ["admin", "ana", "chloe", "david", "gabriel", "jun", "hannah"].map((localPart, index) =>
    member(personWithLocalPart(localPart), linearUserId(index), localPart === "hannah"),
  ),
  invitations: [NEW_HIRE_EMAIL],
  memberId: linearUserId,
  apiKey: "lin_api_acme_fake",
};

/** Mia, the only super admin, owns the Slack session and the Linear key. */
function member(person: SeedPerson, sourceKey: string, suspended: boolean): SeedMember {
  return {
    sourceKey,
    email: person.email,
    displayName: `${person.givenName} ${person.familyName}`,
    status: suspended ? "suspended" : "active",
    isConnectionUser: person.isSuperAdmin,
  };
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
