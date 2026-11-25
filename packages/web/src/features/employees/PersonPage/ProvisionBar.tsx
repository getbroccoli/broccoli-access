import type { PersonPageQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { ProvisionDialog } from "./ProvisionDialog";
import { hasRoleToPick, isRoleBlocked } from "./roleBlocked";

type Props = { person: NonNullable<PersonPageQuery["employee"]> };

/**
 * How many of the person's apps are missing, with Provision for those it can give now. A role to
 * pick comes first.
 */
export function ProvisionBar({ person }: Props) {
  const apps = person.personApps.edges.map(({ node }) => node);
  const missing = apps.filter(({ state }) => state === "MISSING");
  // Counted once every app is loaded, so the number and the list to confirm are whole.
  if (!missing.length || person.personApps.pageInfo.hasNextPage) {
    return null;
  }
  const steps = person.provisionSteps
    .flatMap(({ action, app }) => {
      const row = apps.find((held) => held.app.id === app.id);
      return row ? [{ action, row }] : [];
    })
    .toSorted((one, other) => one.row.app.name.localeCompare(other.row.app.name));
  // A conflict refuses the whole Provision; a role its app no longer offers only blocks an invite.
  const conflict = missing.find(({ roleConflict }) => roleConflict);
  const roleToPick = conflict && hasRoleToPick(conflict) ? conflict : undefined;
  const roleToUpdate =
    (roleToPick ? undefined : conflict) ??
    steps.find(({ action, row }) => action === "INVITE" && isRoleBlocked(row))?.row;
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/50 px-4 py-3">
      <p className="text-sm">
        <span className="font-semibold">
          {missing.length === 1
            ? t("people.provision.missingOne")
            : t("people.provision.missing", { count: String(missing.length) })}
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
