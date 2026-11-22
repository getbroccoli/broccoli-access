import { z } from "zod";

import type { EmployeeListSearch } from "../employeeListSearch";

/** The search params of a person's panel: which tab is open; a hand-edited URL still opens the panel. */
export const employeePanelSearch = z.object({
  tab: z.enum(["overview", "history"]).default("overview").catch("overview"),
});

/** The defaults, left out of the URL. */
export const DEFAULT_EMPLOYEE_PANEL_SEARCH = { tab: "overview" } as const;

/** The People list's own search, leaving the panel's tab behind when the panel closes. */
export function listSearchOf({ q, sort, dir, after }: Partial<EmployeeListSearch>) {
  return { q, sort, dir, after };
}
