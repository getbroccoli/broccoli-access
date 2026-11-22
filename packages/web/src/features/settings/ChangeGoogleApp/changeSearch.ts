import { z } from "zod";

/** Why changing the Google app failed, as `/api/google/callback` reports it. */
const CHANGE_ERRORS = ["cancelled", "not_super_admin", "other_workspace", "failed"] as const;

export type ChangeError = (typeof CHANGE_ERRORS)[number];

/** The search params of `/settings/connections/google-app`: why the last change failed, when it did. */
export const changeSearch = z.object({
  changeError: z.enum(CHANGE_ERRORS).optional().catch(undefined),
});
