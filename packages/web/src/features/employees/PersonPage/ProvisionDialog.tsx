import { useState } from "react";
import { toast } from "sonner";

import {
  PersonPageDocument,
  type PersonPageQuery,
  type ProvisionAction,
  ProvisionEmployeeDocument,
} from "@/__generated__/graphql";
import { useCache, usePayloadMutation } from "@/apollo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { accountChangeActor, forgetPersonApps, StatusBadge } from "@/features/apps";
import { t } from "@/i18n";

type Person = NonNullable<PersonPageQuery["employee"]>;
type PersonApp = Person["personApps"]["edges"][number]["node"];

type Props = {
  person: Pick<Person, "id" | "firstName" | "lastName" | "email">;
  /** What Provision does now, app by app. */
  steps: readonly { action: ProvisionAction; row: PersonApp }[];
  /** While a missing app's role needs the owner first. */
  disabled: boolean;
};

/**
 * Provision, confirmed in a dialog listing each app with its role and who gives it: Broccoli
 * Access, or the owner by hand. The page then follows each app's change.
 */
export function ProvisionDialog({ person, steps, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const cache = useCache();
  const [provision, { loading }] = usePayloadMutation(ProvisionEmployeeDocument, {
    refetch: [PersonPageDocument],
  });
  const name = `${person.firstName} ${person.lastName}`;
  const invited = steps.filter(({ action }) => action === "INVITE").length;
  const confirm = () => {
    setOpen(false);
    const appIds = steps.map(({ row }) => row.app.id);
    provision({ variables: { input: { employeeId: person.id, appIds } } }).catch(() => {
      toast.error(t("people.provision.failed", { name }));
      // What the dialog listed no longer holds: the page reads the person's apps again.
      forgetPersonApps(cache, person.id);
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button type="button" disabled={disabled || loading} />}>
        {t("people.provision.button")}
      </AlertDialogTrigger>
      <AlertDialogContent className="p-6 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("people.provision.title", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{person.email}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
          {steps.map(({ action, row }) => {
            const byHand = action === "GIVE_BY_HAND";
            const actor = byHand ? null : accountChangeActor(row.app);
            return (
              <li
                key={row.app.id}
                className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5"
              >
                <span className="break-words font-semibold">{row.app.name}</span>
                <span className="break-words text-foreground/80">{whatOf(action, row)}</span>
                <StatusBadge tone={byHand ? "warning" : "active"}>
                  {t(byHand ? "people.provision.byHand" : "people.provision.byBroccoli")}
                </StatusBadge>
                {actor && (
                  <span className="col-span-full text-xs text-muted-foreground">
                    {t("apps.change.actorLine", { actor })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {invited > 0 && (
          <p className="text-sm text-foreground/80">
            {t(
              invited === steps.length
                ? "people.provision.appsInvite"
                : "people.provision.someAppsInvite",
              { firstName: person.firstName },
            )}
          </p>
        )}
        {invited < steps.length && steps.some(({ action }) => action === "GIVE_BY_HAND") && (
          <p className="text-sm text-foreground/80">
            {t("people.provision.byHandIsYours", { firstName: person.firstName })}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("apps.change.cancel")}</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={confirm}>
            {steps.length === 1
              ? t("people.provision.confirmOne")
              : t("people.provision.confirm", { count: String(steps.length) })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The role an invite asks for, or Enable for a disabled account; nothing for an app given by hand. */
function whatOf(action: ProvisionAction, { role, app }: PersonApp): string {
  if (action === "REACTIVATE") {
    return t("people.provision.enable");
  }
  if (action === "GIVE_BY_HAND") {
    return "";
  }
  const listed = app.roles.find((option) =>
    role == null ? option.isDefault : option.key === role,
  );
  return listed?.name ?? "";
}
