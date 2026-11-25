import { createFileRoute, notFound } from "@tanstack/react-router";

import { loadPersonPage, PersonPage, personSearch } from "@/features/employees";

/**
 * A person's page: their status and current access; an unknown or malformed id is not found.
 * Google's redirect back lands here with how its consent for changing users ended.
 */
export const Route = createFileRoute("/_authenticated/people_/$employeeId")({
  validateSearch: personSearch,
  loader: async ({ context: { apolloClient }, params: { employeeId } }) => {
    if (!(await loadPersonPage(apolloClient, employeeId))) {
      throw notFound();
    }
  },
  component: PersonPage,
});
