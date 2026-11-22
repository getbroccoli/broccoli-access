import { createFileRoute, notFound } from "@tanstack/react-router";

/** An app's page, which a later change builds; until then it is not found. */
export const Route = createFileRoute("/_authenticated/apps_/$appId")({
  beforeLoad: () => {
    throw notFound();
  },
});
