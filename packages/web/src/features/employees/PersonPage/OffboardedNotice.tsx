import type { PersonPageQuery } from "@/__generated__/graphql";
import { showsCouldntChange } from "@/features/apps";
import { t } from "@/i18n";
import { useGoogleUserWrites } from "@/lib/useGoogleUserWrites";

import { BY_HAND_REASONS } from "./byHandReasons";

type Props = {
  person: NonNullable<PersonPageQuery["employee"]>;
};

/**
 * After offboarding: the apps that still need the owner, each with why. A Disable that failed
 * comes first, then the work Broccoli Access never could do. Nothing shows once nothing is left.
 */
export function OffboardedNotice({ person }: Props) {
  const google = useGoogleUserWrites();
  const failed = [person.directoryAccount, ...person.appAccounts].flatMap((account) =>
    // As the account's own row: a Disable that failed and that no scan has seen done since.
    account?.latestChange?.action === "SUSPEND" && showsCouldntChange(account)
      ? [{ key: account.id, app: account.app.name, why: t("people.offboard.couldntDisable") }]
      : [],
  );
  const byHand = person.offboarding.byHandWork.map(({ app, reason }) => ({
    key: `${app.id} ${reason}`,
    app: app.name,
    why: t(BY_HAND_REASONS[reason]),
  }));
  // With the shared Google app the server still offers the directory's Disable, which nothing can run.
  const { directoryAccount, offboarding } = person;
  const googleByHand =
    google === "unsupported" &&
    directoryAccount &&
    offboarding.accountsToDisable.some(({ id }) => id === directoryAccount.id)
      ? [
          {
            key: directoryAccount.id,
            app: directoryAccount.app.name,
            why: t("people.offboard.needsOwnGoogleApp"),
          },
        ]
      : [];
  const work = [...failed, ...googleByHand, ...byHand];
  if (!work.length) {
    return null;
  }
  const apps = [...new Set(work.map(({ app }) => app))];
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950"
    >
      <p>
        <strong className="font-semibold">
          {apps.length === 1
            ? t("people.offboard.oneAppNeedsYou")
            : t("people.offboard.appsNeedYou", { count: String(apps.length) })}
        </strong>{" "}
        {APP_LIST.format(apps)}.
      </p>
      <ul className="flex flex-col gap-0.5">
        {work.map(({ key, app, why }) => (
          <li key={key}>
            <span className="font-medium">{app}:</span> {why}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Notion, Figma and Slack", without a comma before "and". */
const APP_LIST = new Intl.ListFormat("en-GB", { type: "conjunction" });
