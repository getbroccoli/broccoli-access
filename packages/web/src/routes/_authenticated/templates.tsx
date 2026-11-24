import { createFileRoute, redirect } from "@tanstack/react-router";

import { TemplatesPage } from "@/features/templates";

/** Templates, for admins: the named lists of apps, each with its apps and how many people have it. */
export const Route = createFileRoute("/_authenticated/templates")({
  beforeLoad: ({ context: { me } }) => {
    if (!me.operations.includes("MANAGE_WORKSPACE")) {
      throw redirect({ to: "/people", replace: true });
    }
  },
  component: TemplatesPage,
});
