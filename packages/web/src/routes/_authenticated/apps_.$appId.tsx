import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { AppPage, loadAppPage } from "@/features/apps";

/** An app's page, for admins: its users, and Approve or Ignore; an unknown id is not found. */
export const Route = createFileRoute("/_authenticated/apps_/$appId")({
  beforeLoad: ({ context: { me } }) => {
    if (!me.operations.includes("MANAGE_WORKSPACE")) {
      throw redirect({ to: "/people", replace: true });
    }
  },
  loader: async ({ context: { apolloClient }, params: { appId } }) => {
    if (!(await loadAppPage(apolloClient, appId))) {
      throw notFound();
    }
  },
  component: AppPage,
});
