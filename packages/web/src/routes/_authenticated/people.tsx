import { createFileRoute, Outlet } from "@tanstack/react-router";

import { PeoplePage, peopleSearch } from "@/features/employees";

/** People: everyone in the directory with their status and apps; a person's panel opens over it. */
export const Route = createFileRoute("/_authenticated/people")({
  validateSearch: peopleSearch,
  component: () => (
    <>
      <PeoplePage />
      <Outlet />
    </>
  ),
});
