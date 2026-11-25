import { z } from "zod";

import { googleUserWritesOutcome } from "@/lib/useGoogleUserWrites";

/**
 * The search params of a person's page: whether Offboard is open, the apps unticked in it, joined
 * with `_`, which survive the trip to Google's consent, and how that consent ended when the owner
 * comes back from it.
 */
export const personSearch = z.object({
  offboard: z.boolean().optional().catch(undefined),
  provision: z.boolean().optional().catch(undefined),
  skip: z
    .string()
    .regex(/^[\w-]+$/)
    .optional()
    .catch(undefined),
  googleUserWrites: googleUserWritesOutcome,
});
