import type { PersonPageQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { ProvisionDialog } from "./ProvisionDialog";
import { hasRoleToPick, isRoleBlocked } from "./roleBlocked";

type Props = { person: NonNullable<PersonPageQuery["employee"]> };

/**
 * How many of the person's apps are missing, and how many are in apps without a connection, with
 * Provision for those it can give now. A role to pick comes first.
 */
export function ProvisionBar({ person }: Props) {
  const apps = person.personApps.edges.map(({ node }) => node);
  const missing = apps.filter(({ state }) => state === "MISSING");
  const notConnected = apps.filter(({ state }) => state === "APP_NOT_CONNECTED");
  const lacking = [...missing, ...notConnected];
  // Counted once every app is loaded, so the number and the list to confirm are whole.
  if (!lacking.length || person.personApps.pageInfo.hasNextPage) {
    return null;
  }
  const steps = person.provisionSteps
    .flatMap(({ action, app }) => {
      const row = apps.find((held) => held.app.id === app.id);
      return row ? [{ action, row }] : [];
    })
    .toSorted((one, other) => one.row.app.name.localeCompare(other.row.app.name));
  // A conflict refuses the whole Provision; a role its app no longer offers only blocks an invite.
  const conflict = lacking.find(({ roleConflict }) => roleConflict);
  const roleToPick = conflict && hasRoleToPick(conflict) ? conflict : undefined;
  const roleToUpdate =
    (roleToPick ? undefined : conflict) ??
    steps.find(({ action, row }) => action === "INVITE" && isRoleBlocked(row))?.row;
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/50 px-4 py-3">
      <p className="text-sm">
        <span className="font-semibold">
          {[countOf(missing.length, "missing"), countOf(notConnected.length, "notConnected")]
            .filter(Boolean)
            .join(" ")}
        </span>
        {roleToPick && ` ${t("people.provision.pickRoleFirst", { app: roleToPick.app.name })}`}
        {!roleToPick &&
          roleToUpdate &&
          ` ${t("people.provision.updateRoleFirst", { app: roleToUpdate.app.name })}`}
      </p>
      {steps.length > 0 && (
        <ProvisionDialog person={person} steps={steps} disabled={!!(roleToPick ?? roleToUpdate)} />
      )}
    </div>
  );
}

function countOf(count: number, kind: "missing" | "notConnected") {
  if (!count) return "";
  return count === 1
    ? t(`people.provision.${kind}One`)
    : t(`people.provision.${kind}`, { count: String(count) });
}
