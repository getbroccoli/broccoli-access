import { createFileRoute, redirect } from "@tanstack/react-router";

import { loginSearch } from "@/features/auth";
import { t } from "@/i18n";
import { AuthCard } from "@/shell";

/** The sign-in page; until Sign in with Google arrives it names only the product and the organisation. */
export const Route = createFileRoute("/login")({
  validateSearch: loginSearch,
  beforeLoad: ({ context: { me }, search }) => {
    if (me) {
      // An API address, such as an agent's authorization, is no page of the app: load it.
      const reloadDocument = search.redirect.startsWith("/api/");
      throw redirect({ href: search.redirect, replace: true, reloadDocument });
    }
  },
  component: function Login() {
    const { organizationName } = Route.useRouteContext();
    return <AuthCard title={organizationName ?? t("app.name")} />;
  },
});
