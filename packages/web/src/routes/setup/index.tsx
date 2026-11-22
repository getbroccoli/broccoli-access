import { createFileRoute } from "@tanstack/react-router";

import { ConnectGoogleStep, connectSearch, requireSetupPage, SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** Setup's first step: the browser holding it connects Google Workspace. */
export const Route = createFileRoute("/setup/")({
  validateSearch: connectSearch,
  beforeLoad: (gate) => {
    requireSetupPage("connect_google", gate);
  },
  component: function ConnectGoogle() {
    const { connectError } = Route.useSearch();
    return (
      <SetupLayout
        step="connect_google"
        title={t("setup.connect.title")}
        description={t("setup.connect.description")}
      >
        <ConnectGoogleStep connectError={connectError} />
      </SetupLayout>
    );
  },
});
