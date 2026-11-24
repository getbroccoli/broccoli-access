import { z } from "zod";

/** The longest search the API accepts. */
export const SEARCH_MAX_LENGTH = 100;

/** The tabs of the People page. */
export const PEOPLE_VIEWS = ["all", "suspendedWithAccess", "accountsWithoutPerson"] as const;

export type PeopleView = (typeof PEOPLE_VIEWS)[number];

/** The People page's search params: the tab and the search; a hand-edited one falls back to the defaults. */
export const peopleSearch = z.object({
  view: z.enum(PEOPLE_VIEWS).optional().catch(undefined),
  q: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional().catch(undefined),
});

export type PeopleSearch = z.infer<typeof peopleSearch>;
