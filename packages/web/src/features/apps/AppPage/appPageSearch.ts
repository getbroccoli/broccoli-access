import { z } from "zod";

import { googleUserWritesOutcome } from "@/lib/useGoogleUserWrites";

/** The search params of an app's page: how Google's consent for changing users ended, when the owner comes back from it. */
export const appPageSearch = z.object({ googleUserWrites: googleUserWritesOutcome });
