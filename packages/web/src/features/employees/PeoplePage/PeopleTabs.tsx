import type { PeoplePageQuery } from "@/__generated__/graphql";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { t } from "@/i18n";

import { PEOPLE_VIEWS, type PeopleView } from "../peopleSearch";

type Props = {
  view: PeopleView;
  /** How many people each tab holds; undefined while they load. */
  isOwner: boolean;
  canReadDifferences: boolean;
  accountCount: number | undefined;
  differenceCount: number | undefined;
  counts: PeoplePageQuery["employeeCounts"] | undefined;
  onViewChange: (view: PeopleView) => void;
};

/** The People page's tabs, everyone and those suspended with access, each with its number of people. */
export function PeopleTabs({
  view,
  counts,
  isOwner,
  canReadDifferences,
  accountCount,
  differenceCount,
  onViewChange,
}: Props) {
  const values = {
    all: counts?.all,
    suspendedWithAccess: counts?.suspendedWithAccess,
    accountsWithoutPerson: accountCount,
    differences: differenceCount,
  };
  return (
    <Tabs
      value={view}
      className={view === "differences" ? "w-full" : undefined}
      onValueChange={(value: PeopleView) => onViewChange(value)}
    >
      <TabsList aria-label={t("people.tabs")} className="flex-wrap gap-1">
        {PEOPLE_VIEWS.filter((value) =>
          value === "differences"
            ? canReadDifferences
            : value !== "accountsWithoutPerson" || isOwner,
        ).map((value) => (
          <TabsTab key={value} value={value} className="flex gap-1 px-3 py-2.5">
            {t(`people.tab.${value}`)}
            {values[value] !== undefined && (
              <span className="tabular-nums text-muted-foreground">{values[value]}</span>
            )}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  );
}
