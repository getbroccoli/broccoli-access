import { z } from "zod";

/**
 * Where Google sends the admin back after consent: the one redirect address an admin registers for
 * their Google app, so every Google consent and sign-in comes back through it.
 */
export function googleRedirectAddress(publicOrigin: string): string {
  return `${publicOrigin}/api/google/callback`;
}

/** The connector key and catalog key of Google Workspace. */
export const GOOGLE_WORKSPACE = "google_workspace";

/**
 * What setup asks the admin to allow: who they are, and read access to users, their app access,
 * the organisation and audit logs, which the scans read.
 */
export const GOOGLE_WORKSPACE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.user.security",
  "https://www.googleapis.com/auth/admin.directory.customer.readonly",
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
] as const;

/** The Google Workspace connection's settings; its client secret and refresh token are its secrets. */
export interface GoogleWorkspaceSettings {
  /** Whose Google app reads the workspace; a later circle adds Broccoli's own. */
  googleApp: "own_google_app";
  clientId: string;
  domain: string;
  organizationName: string;
  adminEmail: string;
  grantedScopes: string[];
}

/** The stored settings of the Google Workspace connection, checked as they are read. */
export function parseGoogleWorkspaceSettings(settings: unknown): GoogleWorkspaceSettings {
  return GOOGLE_WORKSPACE_SETTINGS.parse(settings);
}

/** Only a Google super admin may connect the workspace and become the owner. */
export class NotSuperAdminError extends Error {
  constructor() {
    super("The consenting Google account is not a super admin");
    this.name = "NotSuperAdminError";
  }
}

const GOOGLE_WORKSPACE_SETTINGS = z.object({
  googleApp: z.literal("own_google_app"),
  clientId: z.string(),
  domain: z.string(),
  organizationName: z.string(),
  adminEmail: z.string(),
  grantedScopes: z.array(z.string()),
});
