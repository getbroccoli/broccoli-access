import type { MessageKey } from "@/i18n";

import type { ConnectError } from "../connectSearch";
import { GoogleAppForm } from "./GoogleAppForm";
import { HowToConnect } from "./HowToConnect";

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
 * Setup's first step: the admin makes their own Google app, pastes its client ID and secret, and
 * leaves for Google's consent page; Google's answer comes back to the API, which signs them in.
 */
export function ConnectGoogleStep({ connectError }: Props) {
  return (
    <GoogleAppForm
      consentPath="/api/google/connect"
      failure={connectError && CONNECT_ERROR_MESSAGES[connectError]}
    >
      <HowToConnect />
    </GoogleAppForm>
  );
}
