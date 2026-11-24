import { storePickedRole } from "../cache";
import { useRouteContext } from "@tanstack/react-router";
import { toast } from "sonner";
import { PickPersonAppRoleDocument, type PersonPageQuery } from "@/__generated__/graphql";
import { useCache, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

type PersonApp = NonNullable<PersonPageQuery["employee"]>["personApps"]["edges"][number]["node"];

type Props = { row: PersonApp; employeeId: string };

/** Shows the inherited role, or the owner's choice between the disagreeing sources. */
export function PersonAppRole({ row, employeeId }: Props) {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const cache = useCache();
  const [pick, { loading }] = usePayloadMutation(PickPersonAppRoleDocument);
  const { app, role, roleConflict } = row;
  if (!roleConflict) {
    if (!row.templates.length && !role) return "—";
    const listed = app.roles.find((option) =>
      role === null ? option.isDefault : option.key === role,
    );
    return listed?.name ?? (role == null ? "—" : t("templates.role.updateSource"));
  }
  if (!me.isOwner) return t("templates.role.ownerPicks");
  const sources = Map.groupBy(row.roleSources, (source) => source.role);
  const options = app.roles.filter((option) => sources.has(option.isDefault ? null : option.key));
  if (!options.length) return t("templates.role.updateSource");

  async function choose(key: string) {
    const chosen = options.find((option) => option.key === key)!;
    const role = chosen.isDefault ? null : chosen.key;
    try {
      await pick({ variables: { input: { employeeId, appId: app.id, role } } });
      storePickedRole(cache, employeeId, app.id, role);
    } catch {
      toast.error(t("templates.role.failed", { app: app.name }));
    }
  }
  return (
    <select
      aria-label={t("templates.role.label", { app: app.name })}
      value=""
      disabled={loading}
      className="h-8 max-w-full rounded-lg border border-amber-700 bg-background px-2 text-sm"
      onChange={(event) => void choose(event.target.value)}
    >
      <option value="" disabled>
        {t("people.person.pickRole")}
      </option>
      {options.map((option) => {
        const giving = sources.get(option.isDefault ? null : option.key);
        return (
          giving && (
            <option key={option.key} value={option.key}>
              {t("people.person.roleFrom", {
                role: option.name,
                templates: giving.map((source) => source.template.name).join(", "),
              })}
            </option>
          )
        );
      })}
    </select>
  );
}
