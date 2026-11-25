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
    // An account keeps the role it has in its app, which Broccoli Access does not read: the
    // template's role is only what an invite asks for.
    if (row.accountStatus) return "—";
    // No role to show: nothing gives the app, or its connection offers no roles.
    const given = row.choice ? row.choice === "ADDED_FOR_PERSON" : row.templates.length > 0;
    if (!role && (!given || !app.connected || !app.roles.length)) return "—";
    const listed = app.roles.find((option) =>
      role === null ? option.isDefault : option.key === role,
    );
    return (
      listed?.name ??
      (role == null ? t("templates.role.default") : t("templates.role.updateSource"))
    );
  }
  const sources = Map.groupBy(row.roleSources, (source) => source.role);
  const options = [...sources].flatMap(([role, giving]) => {
    const name =
      role === null
        ? (app.roles.find((option) => option.isDefault)?.name ?? t("templates.role.default"))
        : app.roles.find((option) => option.key === role && !option.isDefault)?.name;
    return name ? [{ role, name, giving }] : [];
  });
  if (!options.length)
    return t(me.isOwner ? "templates.role.updateSource" : "templates.role.ownerUpdates");
  if (!me.isOwner) return t("templates.role.ownerPicks");

  async function choose(role: string | null) {
    try {
      const saved = await pick({ variables: { input: { employeeId, appId: app.id, role } } });
      storePickedRole(cache, employeeId, row, saved.role ?? null);
    } catch {
      toast.error(t("templates.role.failed", { app: app.name }));
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={t("templates.role.label", { app: app.name })}
        value=""
        disabled={loading}
        className="h-8 max-w-full rounded-lg border border-amber-700 bg-background px-2 text-sm"
        onChange={(event) => void choose(options[Number(event.target.value)]!.role)}
      >
        <option value="" disabled>
          {t("people.person.pickRole")}
        </option>
        {options.map(({ role, name, giving }, index) => (
          <option key={role ?? ""} value={index}>
            {t("people.person.roleFrom", {
              role: name,
              templates: giving.map((source) => source.template.name).join(", "),
            })}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">{t("templates.role.nextInvite")}</span>
    </div>
  );
}
