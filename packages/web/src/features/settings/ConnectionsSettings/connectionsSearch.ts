import { z } from "zod";

/** Why creating the integration user failed, as `/api/google/callback` reports it. */
const INTEGRATION_USER_ERRORS = [
  "cancelled",
  "permission_refused",
  "email_taken",
  "not_super_admin",
  "other_workspace",
  "failed",
] as const;

export type IntegrationUserError = (typeof INTEGRATION_USER_ERRORS)[number];

/** The search params of `/settings/connections`: why the last creation failed, when it did. */
export const connectionsSearch = z.object({
  integrationUserError: z.enum(INTEGRATION_USER_ERRORS).optional().catch(undefined),
});
