import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/connections/")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/settings/google-workspace", search: location.search, replace: true });
  },
});
