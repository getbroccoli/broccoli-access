import { z } from "zod";

/** Why connecting Google failed, as `/api/google/callback` reports it. */
const CONNECT_ERRORS = ["cancelled", "not_super_admin", "failed"] as const;

export type ConnectError = (typeof CONNECT_ERRORS)[number];

/** The search params of `/setup/`: why the last connection failed, when it did. */
export const connectSearch = z.object({
  connectError: z.enum(CONNECT_ERRORS).optional().catch(undefined),
});
