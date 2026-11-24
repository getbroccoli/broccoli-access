import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsSettings, connectionsSearch } from "@/features/settings";

/** Connections; Google's redirect back lands here with why creating the integration user failed. */
export const Route = createFileRoute("/_authenticated/settings/connections/")({
  validateSearch: connectionsSearch,
  component: function ConnectionsSettingsPage() {
    const { integrationUserError } = Route.useSearch();
    return <ConnectionsSettings integrationUserError={integrationUserError} />;
  },
});
