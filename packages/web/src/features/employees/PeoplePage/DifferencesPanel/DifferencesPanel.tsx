import type { PeopleDifferencesQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { ExtraAccountsTable } from "./ExtraAccountsTable";
import { MissingAppCard } from "./MissingAppCard";

type Props = {
  access: PeopleDifferencesQuery["accessDifferences"];
  isOwner: boolean;
  refresh: () => Promise<unknown>;
};

/** The missing people by app, followed by accounts to keep or disable. */
export function DifferencesPanel({ access, isOwner, refresh }: Props) {
  const groups = Map.groupBy(access.missing ?? [], ({ app }) => app.id);
  const missingApps = [...groups.values()].sort((a, b) =>
    a[0]!.app.name.localeCompare(b[0]!.app.name),
  );
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="missing-apps" className="flex flex-col gap-3">
        <h2 id="missing-apps" className="text-lg font-semibold">
          {t("people.person.missing")}{" "}
          <span className="font-medium text-muted-foreground">{access.missingCount}</span>
        </h2>
        {missingApps.map((differences) => (
          <MissingAppCard
            key={differences[0]!.app.id}
            differences={differences}
            refresh={refresh}
          />
        ))}
        {access.missingCount === 0 && (
          <p className="text-sm text-muted-foreground">{t("people.differences.noMissing")}</p>
        )}
      </section>
      <section aria-labelledby="extra-apps" className="flex flex-col gap-3">
        <h2 id="extra-apps" className="text-lg font-semibold">
          {t("people.person.extra")}{" "}
          <span className="font-medium text-muted-foreground">{access.extraCount}</span>
        </h2>
        {access.extra?.length ? (
          <ExtraAccountsTable differences={access.extra} isOwner={isOwner} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("people.differences.noExtra")}</p>
        )}
      </section>
    </div>
  );
}
