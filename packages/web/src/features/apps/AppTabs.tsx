import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { t } from "@/i18n";

import { APP_TABS, type AppTab } from "./appsSearch";

type Props = {
  tab: AppTab;
  /** How many apps each tab holds; undefined while they load. */
  counts: Record<AppTab, number> | undefined;
  onTabChange: (tab: AppTab) => void;
};

/** The tabs of the Applications page, each with its number of apps. */
export function AppTabs({ tab, counts, onTabChange }: Props) {
  return (
    <Tabs value={tab} onValueChange={(value: AppTab) => onTabChange(value)}>
      <TabsList
        aria-label={t("apps.tabs")}
        className="w-fit gap-1 rounded-lg border-0 bg-muted p-1"
      >
        {APP_TABS.map((value) => (
          <TabsTab
            key={value}
            value={value}
            className="mb-0 flex gap-1.5 rounded-md border-0 px-3 py-1.5 pb-1.5 data-active:bg-card data-active:shadow-sm"
          >
            {t(`apps.tab.${value}`)}
            {counts && (
              <span className="font-normal text-muted-foreground tabular-nums">
                {counts[value]}
              </span>
            )}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  );
}
