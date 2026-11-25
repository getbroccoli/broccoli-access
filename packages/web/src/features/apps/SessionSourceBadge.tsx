import type { AppSessionSource } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

type Props = {
  /** Who made the connection's app session; null for a connection without one, which shows nothing. */
  sessionFrom: AppSessionSource | null | undefined;
};

/** "Acts as the integration user", or "Uses your own session" for a session the extension handed over. */
export function SessionSourceBadge({ sessionFrom }: Props) {
  if (!sessionFrom) {
    return null;
  }
  const actsAsIntegrationUser = sessionFrom === "SERVER_SIGN_IN";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        actsAsIntegrationUser ? "bg-brand-soft text-brand-deep" : "bg-amber-100 text-amber-900",
      )}
    >
      {t(
        actsAsIntegrationUser
          ? "settings.apps.actsAsIntegrationUser"
          : "settings.apps.usesOwnSession",
      )}
    </span>
  );
}
