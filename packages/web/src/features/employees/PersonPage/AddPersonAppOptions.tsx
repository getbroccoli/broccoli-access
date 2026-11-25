import { useQuery } from "@apollo/client/react";
import { PersonAppOptionsDocument } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

type Props = {
  employeeId: string;
  /** `role` is null for an app without roles and for its default role. */
  onAdd: (app: { id: string; name: string }, role: string | null) => void;
};

/**
 * The approved apps that neither the person's templates nor the owner gives them yet, read when the
 * menu opens.
 */
export function AddPersonAppOptions({ employeeId, onAdd }: Props) {
  const { data, error, refetch } = useQuery(PersonAppOptionsDocument, {
    variables: { employeeId },
    fetchPolicy: "network-only",
  });
  if (!data && error)
    return (
      <DropdownMenuItem closeOnClick={false} onClick={() => void refetch().catch(() => undefined)}>
        {t("people.person.addApp.error")} · {t("templates.retry")}
      </DropdownMenuItem>
    );
  if (!data)
    return <DropdownMenuItem disabled>{t("people.person.addApp.loading")}</DropdownMenuItem>;
  const givenAppIds = new Set(
    data.employee?.personApps.edges
      .filter(({ node }) => node.templates.length || node.choice === "ADDED_FOR_PERSON")
      .map(({ node }) => node.app.id),
  );
  const apps = data.apps.edges.map(({ node }) => node).filter(({ id }) => !givenAppIds.has(id));
  if (!apps.length)
    return <DropdownMenuItem disabled>{t("people.person.addApp.none")}</DropdownMenuItem>;
  return apps.map((app) => {
    const mark = <AppMark name={app.name} catalogKey={app.catalogKey ?? null} className="size-5" />;
    if (!app.connected || !app.roles.length)
      return (
        <DropdownMenuItem key={app.id} onClick={() => onAdd(app, null)}>
          {mark}
          {app.name}
        </DropdownMenuItem>
      );
    return (
      <DropdownMenuSub key={app.id}>
        <DropdownMenuSubTrigger>
          {mark}
          {app.name}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent aria-label={t("templates.role.label", { app: app.name })}>
          {app.roles.map((role) => (
            <DropdownMenuItem
              key={role.key}
              onClick={() => onAdd(app, role.isDefault ? null : role.key)}
            >
              {role.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  });
}
