import { createFileRoute, redirect } from "@tanstack/react-router";

import { ActivityPage } from "@/features/apps";

/** Activity, for admins: every Disable and Enable, newest first. */
export const Route = createFileRoute("/_authenticated/activity")({
  beforeLoad: ({ context: { me } }) => {
    if (!me.operations.includes("MANAGE_WORKSPACE")) {
      throw redirect({ to: "/people", replace: true });
    }
  },
  component: ActivityPage,
});
