import { createFileRoute } from "@tanstack/react-router";

import { OwnerSetupForm, requireSetupPage, SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** Setup's only step: the browser holding it creates the owner account. */
export const Route = createFileRoute("/setup/")({
  beforeLoad: (gate) => {
    requireSetupPage("owner", gate);
  },
  component: function Owner() {
    return (
      <SetupLayout step="owner" title={t("setup.owner.heading")} width="narrow">
        <OwnerSetupForm width="narrow" />
      </SetupLayout>
    );
  },
});
