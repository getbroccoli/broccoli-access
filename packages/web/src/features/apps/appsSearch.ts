import { z } from "zod";

/** The tabs of the Applications page, one per app status. */
export const APP_TABS = ["approved", "discovered", "ignored"] as const;

export type AppTab = (typeof APP_TABS)[number];

/** The Applications page's search params: the tab, by its status; a hand-edited one falls back to the page's default. */
export const appsSearch = z.object({
  status: z.enum(APP_TABS).optional().catch(undefined),
});
