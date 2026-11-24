import type { GoogleWorkspaceSettings } from "../domain";

/** What the browser holding setup sends to start the consent. */
export interface ConnectionStart extends AppChangeStart {
  setupToken: string | null;
}

/** Google's redirect back after the admin allowed access. */
export interface ConsentAnswer {
  code?: string;
  handle?: string;
  state: string;
  publicOrigin: string;
  setupToken: string | null;
  now: Date;
}

/** What the owner sends to change the Google app. */
export interface AppChangeStart {
  /** The browser Origin, after transport verifies it belongs to this instance. */
  browserOrigin?: string;
  googleApp?: GoogleWorkspaceSettings["googleApp"];
  clientId?: string;
  clientSecret?: string;
  /** Where browsers reach the instance; Google redirects to its callback there. */
  publicOrigin: string;
  now: Date;
}

/** Google's redirect back after the admin allowed the new Google app. */
export interface AppChangeAnswer extends Omit<ConsentAnswer, "setupToken"> {
  /** The token `startAppChange` gave the browser; null when the browser has none. */
  browserToken: string | null;
}

export interface GoogleWorkspaceConnection {
  googleApp: GoogleWorkspaceSettings["googleApp"];
  clientId: string;
  id: string;
  domain: string;
  organizationName: string;
  adminEmail: string;
}
