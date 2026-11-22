import { createFileRoute, notFound } from "@tanstack/react-router";

import { loadPersonPage, PersonPage } from "@/features/employees";

/** A person's page: their status and current access; an unknown or malformed id is not found. */
export const Route = createFileRoute("/_authenticated/people_/$employeeId")({
  loader: async ({ context: { apolloClient }, params: { employeeId } }) => {
    if (!(await loadPersonPage(apolloClient, employeeId))) {
      throw notFound();
    }
  },
  component: PersonPage,
});
