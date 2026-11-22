import { createFileRoute, redirect } from "@tanstack/react-router";

/** Home is Applications. */
export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: () => {
    throw redirect({ to: "/apps", replace: true });
  },
});
