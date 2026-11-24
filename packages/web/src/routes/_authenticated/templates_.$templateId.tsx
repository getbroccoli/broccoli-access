import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { loadTemplatePage, TemplatePage } from "@/features/templates";

/** A template's page, for admins: its name, its apps and its people; an unknown id is not found. */
export const Route = createFileRoute("/_authenticated/templates_/$templateId")({
  beforeLoad: ({ context: { me } }) => {
    if (!me.operations.includes("MANAGE_WORKSPACE")) {
      throw redirect({ to: "/people", replace: true });
    }
  },
  loader: async ({ context: { apolloClient }, params: { templateId } }) => {
    if (!(await loadTemplatePage(apolloClient, templateId))) {
      throw notFound();
    }
  },
  component: TemplatePage,
});
