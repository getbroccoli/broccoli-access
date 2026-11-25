import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { integrationUserFailure, useConnectWithIntegrationUser } from "../ConnectAppSessionDialog";
import { REFETCH_AFTER_RECONNECT } from "../cache";

type Props = {
  connector: { id: string; name: string };
  button: { size: "sm" | "lg"; variant: "default" | "outline" };
};

/**
 * Reconnect for a connection that acts as the integration user: it signs in as it again, never as
 * the owner, so who the connection acts as does not change.
 */
export function ReconnectIntegrationUserButton({ connector, button }: Props) {
  const [signIn, { loading, error, payloadError }] =
    useConnectWithIntegrationUser(REFETCH_AFTER_RECONNECT);
  const failure = integrationUserFailure(payloadError, error !== undefined);

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size={button.size}
        variant={button.variant}
        className={button.size === "sm" ? "px-3" : "px-4"}
        disabled={loading}
        // `usePayloadMutation` keeps a failure for display, so the rejection needs no handling here.
        onClick={() =>
          void signIn({ variables: { input: { connector: connector.id } } }).catch(() => undefined)
        }
      >
        {loading ? t("apps.reconnect.reconnecting") : t("apps.reconnect.integrationUserButton")}
      </Button>
      {failure && (
        <span role="alert" className={cn("max-w-72 text-right text-xs text-destructive")}>
          {t(failure, { app: connector.name })}
        </span>
      )}
    </span>
  );
}
