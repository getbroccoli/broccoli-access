import type { PeoplePageQuery } from "@/__generated__/graphql";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { PEOPLE_VIEWS, type PeopleView } from "../peopleSearch";

type Props = {
  view: PeopleView;
  /** How many people each tab holds; undefined while they load. */
  counts: PeoplePageQuery["employeeCounts"] | undefined;
  onViewChange: (view: PeopleView) => void;
};

/** The People page's tabs, everyone and those suspended with access, each with its number of people. */
export function PeopleTabs({ view, counts, onViewChange }: Props) {
  return (
    <Tabs value={view} onValueChange={(value: PeopleView) => onViewChange(value)}>
      <TabsList
        aria-label={t("people.tabs")}
        className="w-fit gap-1 rounded-lg border-0 bg-muted p-1"
      >
        {PEOPLE_VIEWS.map((value) => (
          <TabsTab
            key={value}
            value={value}
            className="mb-0 flex gap-1.5 rounded-md border-0 px-3 py-1.5 pb-1.5 data-active:bg-card data-active:shadow-sm"
          >
            {t(`people.tab.${value}`)}
            {counts && (
              <span
                className={cn(
                  "tabular-nums",
                  value === "all"
                    ? "font-normal text-muted-foreground"
                    : "rounded-full bg-amber-100 px-2 text-xs leading-5 font-medium text-amber-900",
                )}
              >
                {value === "all" ? counts.all : counts.suspendedWithAccess}
              </span>
            )}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  );
}
