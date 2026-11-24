import type { PeoplePageQuery } from "@/__generated__/graphql";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { t } from "@/i18n";

import { PEOPLE_VIEWS, type PeopleView } from "../peopleSearch";

type Props = {
  view: PeopleView;
  /** How many people each tab holds; undefined while they load. */
  isOwner: boolean;
  accountCount: number | undefined;
  counts: PeoplePageQuery["employeeCounts"] | undefined;
  onViewChange: (view: PeopleView) => void;
};

/** The People page's tabs, everyone and those suspended with access, each with its number of people. */
export function PeopleTabs({ view, counts, isOwner, accountCount, onViewChange }: Props) {
  const values = {
    all: counts?.all,
    suspendedWithAccess: counts?.suspendedWithAccess,
    accountsWithoutPerson: accountCount,
  };
  return (
    <Tabs value={view} onValueChange={(value: PeopleView) => onViewChange(value)}>
      <TabsList aria-label={t("people.tabs")} className="flex-wrap gap-1">
        {PEOPLE_VIEWS.filter((value) => value !== "accountsWithoutPerson" || isOwner).map(
          (value) => (
            <TabsTab key={value} value={value} className="flex gap-1 px-3 py-2.5">
              {t(`people.tab.${value}`)}
              {values[value] !== undefined && (
                <span className="tabular-nums text-muted-foreground">{values[value]}</span>
              )}
            </TabsTab>
          ),
        )}
      </TabsList>
    </Tabs>
  );
}
