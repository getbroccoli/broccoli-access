import type { MessageKey } from "@/i18n";

import type { ConnectError } from "../connectSearch";
import { GoogleAppForm } from "./GoogleAppForm";

const CONNECT_ERROR_MESSAGES: Record<ConnectError, MessageKey> = {
  cancelled: "setup.connect.cancelled",
  not_super_admin: "setup.connect.notSuperAdmin",
  failed: "setup.connect.failed",
};

type Props = {
  /** Why the last connection failed, from Google's redirect back. */
  connectError: ConnectError | undefined;
};

/**
 * Setup's first step: choose a Google app and consent as a super admin, who becomes the owner.
 */
export function ConnectGoogleStep({ connectError }: Props) {
  return (
    <GoogleAppForm
      consentPath="/api/google/connect"
      failure={connectError && CONNECT_ERROR_MESSAGES[connectError]}
    />
  );
}
