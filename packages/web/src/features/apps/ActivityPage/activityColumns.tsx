import type { DataTableColumn } from "@/components/dataTable";
import { AppMark } from "@/components/AppMark";
import { t } from "@/i18n";
import { dayAndTime } from "@/lib/dayAndTime";

import type { AccountChangeRow } from "./accountChangeRow";
import { ChangeOutcome } from "./ChangeOutcome";
import { ChangePersonCell } from "./ChangePersonCell";

const PERSON: DataTableColumn<AccountChangeRow> = {
  id: "person",
  header: t("apps.activity.column.person"),
  className: "min-w-56",
  cell: (change) => <ChangePersonCell change={change} />,
};

const APP: DataTableColumn<AccountChangeRow> = {
  id: "app",
  header: t("apps.activity.column.app"),
  cell: ({ app }) => (
    <span className="flex items-center gap-2 font-medium whitespace-nowrap">
      <AppMark name={app.name} catalogKey={app.catalogKey} className="size-6" />
      {app.name}
    </span>
  ),
};

const CHANGE: DataTableColumn<AccountChangeRow> = {
  id: "change",
  header: t("apps.activity.column.change"),
  cell: ({ action }) => t(ACTIONS[action]),
};

const ASKED: DataTableColumn<AccountChangeRow> = {
  id: "asked",
  header: t("apps.activity.column.asked"),
  cell: ({ requestedBy, requestedAt }) => {
    const { day, time } = dayAndTime(requestedAt);
    return (
      <span className="flex flex-col whitespace-nowrap text-foreground/80">
        <span>{requestedBy.name}</span>
        <span className="text-xs text-muted-foreground">
          {day === null
            ? t("apps.activity.askedToday", { time })
            : t("apps.activity.askedOn", { day, time })}
        </span>
      </span>
    );
  },
};

const OUTCOME: DataTableColumn<AccountChangeRow> = {
  id: "outcome",
  header: t("apps.activity.column.outcome"),
  cell: (change) => <ChangeOutcome change={change} />,
};

/** Who and which app, Disable, Enable or Invite, who asked and when, and how it ended. */
export const ACTIVITY_COLUMNS = [PERSON, APP, CHANGE, ASKED, OUTCOME];

/** Disable, Enable or Invite, as the buttons name them. */
const ACTIONS = {
  SUSPEND: "apps.change.disable",
  REACTIVATE: "apps.change.enable",
  REMOVE: "apps.change.remove",
  INVITE: "apps.change.invite",
} as const;
