import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/connections/google-app")({
  beforeLoad: ({ location }) => {
    throw redirect({
      to: "/settings/google-workspace/google-app",
      search: location.search,
      replace: true,
    });
  },
});
