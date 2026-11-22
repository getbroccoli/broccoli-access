import { GoogleAppForm } from "@/features/setup";
import { t, type MessageKey } from "@/i18n";
import { PageHeader } from "@/shell";

import type { ChangeError } from "./changeSearch";

const CHANGE_ERROR_MESSAGES: Record<ChangeError, MessageKey> = {
  cancelled: "settings.googleApp.cancelled",
  not_super_admin: "setup.connect.notSuperAdmin",
  other_workspace: "settings.googleApp.otherWorkspace",
  failed: "settings.googleApp.failed",
};

type Props = {
  /** Why the last change failed, from Google's redirect back. */
  changeError: ChangeError | undefined;
};

/**
 * Changing the Google app the connection reads Google Workspace with: the same form as setup's,
 * then Google's consent as a super admin; the old app stays until Google allows the new one.
 */
export function ChangeGoogleApp({ changeError }: Props) {
  return (
    <div className="flex max-w-3xl flex-col">
      <PageHeader
        title={t("settings.googleApp.title")}
        description={t("settings.googleApp.description")}
      />
      <GoogleAppForm
        consentPath="/api/google/change-app"
        failure={changeError && CHANGE_ERROR_MESSAGES[changeError]}
      />
    </div>
  );
}
