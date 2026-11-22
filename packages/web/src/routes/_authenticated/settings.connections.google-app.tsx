import { createFileRoute } from "@tanstack/react-router";

import { ChangeGoogleApp, changeSearch } from "@/features/settings";

/** Changing the Google app; Google's redirect back lands here with why a change failed. */
export const Route = createFileRoute("/_authenticated/settings/connections/google-app")({
  validateSearch: changeSearch,
  component: function ChangeGoogleAppPage() {
    const { changeError } = Route.useSearch();
    return <ChangeGoogleApp changeError={changeError} />;
  },
});
