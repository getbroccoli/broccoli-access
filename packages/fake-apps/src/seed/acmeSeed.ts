/**
 * Acme, the demo company the fake Google serves. Its numbers are the circle 1 design canvas's,
 * and tests import it for their expected values, so it is fixed data with no randomness.
 */
export interface AcmeSeed {
  customer: SeedCustomer;
  /** The instance's own Google app, used in development and tests; not one of the apps. */
  oauthClient: SeedOAuthClient;
  people: SeedPerson[];
  apps: SeedApp[];
  grants: SeedGrant[];
}

export interface SeedCustomer {
  id: string;
  domain: string;
  organizationName: string;
  creationTime: string;
}

export interface SeedOAuthClient {
  clientId: string;
  clientSecret: string;
  name: string;
}

export interface SeedPerson {
  /** The Google user id. */
  id: string;
  email: string;
  givenName: string;
  familyName: string;
  managerEmail: string | null;
  isSuperAdmin: boolean;
  suspended: boolean;
  creationTime: string;
  /** Their placeholder portrait, a 96×96 PNG; null keeps the initials. */
  photo: Buffer | null;
}

export interface SeedApp {
  clientId: string;
  name: string;
}

export interface SeedGrant {
  email: string;
  clientId: string;
  scopes: string[];
  /** Whole days between the grant and the fake's start, so the grant log always splits the seed alike. */
  daysBeforeStart: number;
}
