import { createFileRoute, redirect } from "@tanstack/react-router";

import { GoogleSignIn, loginSearch } from "@/features/auth";
import { t } from "@/i18n";
import { AuthCard } from "@/shell";

/** The sign-in page: Sign in with Google, for the organisation that set up the instance. */
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
    const { organizationName, organizationDomain } = Route.useRouteContext();
    const { signInError } = Route.useSearch();
    return (
      <AuthCard
        title={t("auth.signIn.title", { organization: organizationName ?? t("app.name") })}
        description={
          organizationDomain
            ? t("auth.signIn.description", { domain: organizationDomain })
            : undefined
        }
      >
        <GoogleSignIn signInError={signInError} />
      </AuthCard>
    );
  },
});
