import { createFileRoute } from "@tanstack/react-router";

import { GoogleWorkspaceSettings, googleWorkspaceSearch } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/google-workspace/")({
  validateSearch: googleWorkspaceSearch,
  component: function GoogleWorkspaceSettingsPage() {
    const { integrationUserError } = Route.useSearch();
    return <GoogleWorkspaceSettings integrationUserError={integrationUserError} />;
  },
});
