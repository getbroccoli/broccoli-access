import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppsPage, appsSearch } from "@/features/apps";

/** Applications, for admins: the company's apps by status, and setup's last step while it selects them. */
export const Route = createFileRoute("/_authenticated/apps")({
  validateSearch: appsSearch,
  beforeLoad: ({ context: { me } }) => {
    // Home is this page, so anyone else goes to People.
    if (!me.operations.includes("MANAGE_WORKSPACE")) {
      throw redirect({ to: "/people", replace: true });
    }
  },
  component: AppsPage,
});
