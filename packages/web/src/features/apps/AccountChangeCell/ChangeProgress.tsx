import { CircleNotch } from "@phosphor-icons/react";

import type { AccountChangeCell_AppUserFragment } from "@/__generated__/graphql";
import { t } from "@/i18n";

type Props = {
  app: string;
  change: Pick<
    NonNullable<AccountChangeCell_AppUserFragment["latestChange"]>,
    "action" | "changesAhead"
  >;
};

/** A running change: waiting for the connection's earlier changes, or running now. */
export function ChangeProgress({ app, change }: Props) {
  return (
    <span
      role="status"
      className="flex items-center justify-end gap-2 text-sm whitespace-nowrap text-sky-800"
    >
      <CircleNotch size={14} weight="bold" aria-hidden className="shrink-0 animate-spin" />
      {progressText(app, change)}
    </span>
  );
}

function progressText(app: string, { action, changesAhead }: Props["change"]): string {
  const ahead = changesAhead ?? 0;
  if (ahead === 1) {
    return t("apps.change.waitingOne", { app });
  }
  if (ahead > 1) {
    return t("apps.change.waiting", { app, count: String(ahead) });
  }
  return t(RUNNING[action], { app });
}

const RUNNING = {
  SUSPEND: "apps.change.disabling",
  REACTIVATE: "apps.change.enabling",
  INVITE: "apps.change.inviting",
} as const;
