import { createFileRoute } from "@tanstack/react-router";

import { PeoplePage, peopleSearch } from "@/features/employees";

/** People: everyone in the directory with their status and apps, and who is suspended with access. */
export const Route = createFileRoute("/_authenticated/people")({
  validateSearch: peopleSearch,
  component: PeoplePage,
});
