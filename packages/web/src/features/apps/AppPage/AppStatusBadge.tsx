import type { AppStatus } from "@/__generated__/graphql";
import { type MessageKey, t } from "@/i18n";
import { cn } from "@/lib/class-names";

/** Each status's words, as its tab names it, and its colour: green once approved. */
const LOOKS: Record<AppStatus, { label: MessageKey; className: string }> = {
  APPROVED: { label: "apps.tab.approved", className: "bg-brand-soft text-brand-deep" },
  DISCOVERED: { label: "apps.tab.discovered", className: "bg-muted text-foreground" },
  IGNORED: { label: "apps.tab.ignored", className: "bg-muted text-muted-foreground" },
};

type Props = { status: AppStatus };

/** Whether the company uses the app, in a small pill. */
export function AppStatusBadge({ status }: Props) {
  const { label, className } = LOOKS[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {t(label)}
    </span>
  );
}
