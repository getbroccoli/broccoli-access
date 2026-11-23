import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { useReconnectAppSession } from "./useReconnectAppSession";

type Props = {
  connector: { id: string; name: string };
  button: { label: string; size: "sm" | "lg"; variant: "default" | "outline" };
};

/** Reconnect for an app session: the extension's window asks the owner, then it reconnects. */
export function ReconnectAppSessionButton({ connector, button }: Props) {
  const { start, handOver, reconnecting } = useReconnectAppSession(connector);
  // Busy from the click until it reconnects: a second click would drop the hand-over in flight.
  const busy = handOver.isAwaiting || handOver.isReading || reconnecting.loading;
  const message = messageOf(connector.name, { handOver, reconnecting });

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size={button.size}
        variant={button.variant}
        className={button.size === "sm" ? "px-3" : "px-4"}
        disabled={busy}
        onClick={start}
      >
        {handOver.isReading || reconnecting.loading
          ? t("apps.reconnect.reconnecting")
          : button.label}
      </Button>
      {message && (
        <span
          role={message.isError ? "alert" : "status"}
          className={cn(
            "max-w-72 text-right text-xs",
            message.isError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}

type Progress = Pick<ReturnType<typeof useReconnectAppSession>, "handOver" | "reconnecting">;

/** What the owner needs to know now: where to confirm, or why reconnecting stopped. */
function messageOf(app: string, { handOver, reconnecting }: Progress) {
  if (handOver.isAwaiting) {
    return { text: t("apps.reconnect.confirmInWindow"), isError: false };
  }
  const failure = handOverFailure(app, handOver) ?? reconnectFailure(app, reconnecting);
  return failure ? { text: failure, isError: true } : null;
}

function handOverFailure(app: string, handOver: Progress["handOver"]): string | null {
  if (handOver.isWindowBlocked) {
    return t("settings.appSession.windowBlocked");
  }
  if (handOver.wasAbandoned) {
    return t("apps.reconnect.notHandedOver", { app });
  }
  return handOver.readFailed ? t("apps.reconnect.readFailed", { app }) : null;
}

function reconnectFailure(
  app: string,
  { payloadError, error }: Progress["reconnecting"],
): string | null {
  if (payloadError?.__typename === "InvalidInputError") {
    const code = payloadError.fields.find(({ field }) => field === "appSession")?.code;
    if (code === "wrong_workspace") {
      return t("apps.reconnect.otherWorkspace", { app });
    }
    return code === "invalid"
      ? t("apps.reconnect.expired", { app })
      : t("apps.reconnect.refused", { app });
  }
  if (payloadError?.__typename === "UnavailableError") {
    return t("apps.reconnect.unavailable", { app });
  }
  return payloadError || error ? t("apps.reconnect.failed", { app }) : null;
}
