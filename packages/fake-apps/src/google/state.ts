import type { AcmeSeed, SeedCustomer, SeedPerson } from "../seed";
import type { AdminMethod } from "./adminMethods";
import type { ConnectorError } from "./googleErrors";

/** Everything the fake Google holds, in memory; a reset replaces it with a fresh seeded one. */
export interface GoogleState {
  customer: SeedCustomer;
  people: SeedPerson[];
  grants: Grant[];
  events: GrantEvent[];
  clients: OAuthClient[];
  accessTokens: Map<string, AccessToken>;
  refreshTokens: Map<string, RefreshToken>;
  authorizationCodes: Map<string, AuthorizationCode>;
  failures: Map<AdminMethod, PlannedFailure>;
}

/** A person's consent to an OAuth client, as Directory tokens list it. */
export interface Grant {
  email: string;
  clientId: string;
  appName: string;
  scopes: string[];
  grantedAt: Date;
}

/** An `authorize` event of the grant log, as Reports lists it. */
export interface GrantEvent {
  time: Date;
  uniqueQualifier: string;
  email: string;
  profileId: string;
  clientId: string;
  appName: string;
  scopes: string[];
}

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  /** Shown on the consent page and as the grant's display text. */
  name: string;
  redirectUris: string[];
}

/** What a token was issued for; the Admin APIs check both the account and the scopes. */
export interface TokenHolder {
  email: string;
  clientId: string;
  scopes: string[];
}

export interface AccessToken extends TokenHolder {
  expiresAt: Date;
}

export type RefreshToken = TokenHolder;

export interface AuthorizationCode extends TokenHolder {
  redirectUri: string;
  nonce: string | undefined;
  /** Set when the person consented now to an offline request, as Google requires. */
  issuesRefreshToken: boolean;
}

export interface PlannedFailure {
  error: ConnectorError;
  remaining: number;
}

/** How far back Google's grant log reaches. */
const GRANT_LOG_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Random-looking but fixed, so grant events have stable ids across runs. */
const FIRST_EVENT_QUALIFIER = 7310462093812215871n;

/** A fresh state holding the seed, its grant dates counted back from `start`. */
export function seededState(seed: AcmeSeed, start: Date, redirectUris: string[]): GoogleState {
  const state: GoogleState = {
    customer: seed.customer,
    people: seed.people.map((person) => ({ ...person })),
    grants: [],
    events: [],
    clients: [{ ...seed.oauthClient, redirectUris }],
    accessTokens: new Map(),
    refreshTokens: new Map(),
    authorizationCodes: new Map(),
    failures: new Map(),
  };
  for (const { email, clientId, scopes, daysBeforeStart } of seed.grants) {
    const appName = seed.apps.find((app) => app.clientId === clientId)?.name ?? clientId;
    const grantedAt = new Date(start.getTime() - daysBeforeStart * DAY_MS);
    grantAccess(state, { email, clientId, appName, scopes, grantedAt }, start);
  }
  return state;
}

/**
 * Records a person's grant, replacing an earlier one to the same client, and its log event
 * when the grant falls inside the log at `now`, as Google does.
 */
export function grantAccess(state: GoogleState, grant: Grant, now: Date): void {
  revokeGrant(state, grant.email, grant.clientId);
  state.grants.push(grant);
  const person = findPerson(state, grant.email);
  if (person === undefined || !isInsideGrantLog(grant.grantedAt, now)) return;
  state.events.push({
    time: grant.grantedAt,
    uniqueQualifier: String(FIRST_EVENT_QUALIFIER + BigInt(state.events.length)),
    email: grant.email,
    profileId: person.id,
    clientId: grant.clientId,
    appName: grant.appName,
    scopes: grant.scopes,
  });
}

/** Removes a person's grant to a client; answers whether there was one. */
export function revokeGrant(state: GoogleState, email: string, clientId: string): boolean {
  const before = state.grants.length;
  state.grants = state.grants.filter(
    (grant) => !(grant.email === email && grant.clientId === clientId),
  );
  return state.grants.length < before;
}

/** A person's grant to a client, if they consented to it. */
export function findGrant(state: GoogleState, email: string, clientId: string): Grant | undefined {
  return state.grants.find((grant) => grant.email === email && grant.clientId === clientId);
}

/** Finds a person by Google user id or by email, as Directory's `userKey` does. */
export function findPerson(state: GoogleState, userKey: string): SeedPerson | undefined {
  const key = userKey.toLowerCase();
  return state.people.find((person) => person.id === key || person.email === key);
}

/** The name Google shows for a person, as Directory's `fullName` and the ID token's `name`. */
export function fullName(person: SeedPerson): string {
  return `${person.givenName} ${person.familyName}`;
}

export function isInsideGrantLog(time: Date, now: Date): boolean {
  return time.getTime() > now.getTime() - GRANT_LOG_DAYS * DAY_MS && time <= now;
}
