import { useRouteContext } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  PersonPageDocument,
  PickPersonAppRoleDocument,
  type PersonPageQuery,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

type PersonApp = NonNullable<PersonPageQuery["employee"]>["personApps"]["edges"][number]["node"];

type Props = { row: PersonApp; employeeId: string };

/** Shows the inherited role, or the owner's choice between the disagreeing sources. */
export function PersonAppRole({ row, employeeId }: Props) {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const [pick, { loading }] = usePayloadMutation(PickPersonAppRoleDocument, {
    refetch: [PersonPageDocument],
  });
  const { app, role, roleConflict } = row;
  if (!roleConflict) {
    if (!row.templates.length && !role) return "—";
    return (
      app.roles.find((option) => (role === null ? option.isDefault : option.key === role))?.name ??
      role ??
      "—"
    );
  }
  const sources = Map.groupBy(row.roleSources, (source) => source.role);
  return (
    <select
      aria-label={t("templates.role.label", { app: app.name })}
      value=""
      disabled={loading || !me.isOwner}
      className="h-8 max-w-full rounded-lg border border-amber-700 bg-background px-2 text-sm"
      onChange={(event) =>
        void pick({
          variables: { input: { employeeId, appId: app.id, role: event.target.value } },
        }).catch(() => toast.error(t("templates.role.failed", { app: app.name })))
      }
    >
      <option value="" disabled>
        {t("people.person.pickRole")}
      </option>
      {app.roles.map((option) => {
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
