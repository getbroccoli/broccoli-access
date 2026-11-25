import { useQuery } from "@apollo/client/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  DeletePersonDocument,
  DirectoryProvisionAppsDocument,
  PeoplePageDocument,
  type PersonPageQuery,
  ProvisionEmployeeDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
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
import { t } from "@/i18n";
import {
  askGoogleForUserWrites,
  directoryProvisionFailure,
  googleUserWritesBlock,
  GOOGLE_WORKSPACE,
  useGoogleUserWrites,
} from "@/lib/useGoogleUserWrites";
import { useRestoredFromBackCache } from "@/lib/useRestoredFromBackCache";
import { removeEmployee } from "../cache";
import { hasRoleToPick } from "./roleBlocked";

type Person = NonNullable<PersonPageQuery["employee"]>;
type Props = {
  person: Person;
  confirmAfterConsent: boolean;
  refetch: () => Promise<unknown>;
};

/** Starts or retries the person's directory creation after the owner confirms the apps. */
export function DirectoryProvisionPanel({ person, confirmAfterConsent, refetch }: Props) {
  const google = useGoogleUserWrites();
  const [askingGoogle, setAskingGoogle] = useState(false);
  const [open, setOpen] = useState(confirmAfterConsent);
  const stopWaiting = useCallback(() => setAskingGoogle(false), []);
  useRestoredFromBackCache(stopWaiting);

  const state = person.directoryProvision;
  if (!state) return null;
  if (state.status === "SUCCEEDED") {
    return person.directoryAccount ? null : (
      <p role="status" className="rounded-xl border border-border bg-muted px-4 py-3 text-sm">
        {t("people.add.scanDirectory")}
      </p>
    );
  }

  const canStart = google === "allowed" || google === "needs_consent";
  const offersStart = state.status !== "RUNNING" && !person.directoryAccount;
  const permissionNote =
    google === "needs_consent" ? "people.provision.beforeConsent" : googleUserWritesBlock(google);
  async function start() {
    if (google === "allowed") {
      setOpen(true);
      return;
    }
    setAskingGoogle(true);
    if (await askGoogleForUserWrites(`/people/${person.id}?provision=true`)) return;
    setAskingGoogle(false);
    toast.error(t("people.offboard.googleStartFailed"));
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted px-4 py-3">
      <p role="status" className="text-sm">
        {t(provisionMessage(state))}
        {offersStart && permissionNote && ` ${t(permissionNote)}`}
      </p>
      {!askingGoogle && (state.canDelete || offersStart) && (
        <div className="flex gap-2">
          {state.canDelete && <DeletePersonButton person={person} refetch={refetch} />}
          {offersStart && (
            <Button type="button" disabled={!canStart} onClick={() => void start()}>
              {t(
                google === "needs_consent"
                  ? "apps.change.continueToGoogle"
                  : state.status === "FAILED"
                    ? "people.error.retry"
                    : "people.provision.button",
              )}
            </Button>
          )}
        </div>
      )}
      {offersStart && (
        <ConfirmDirectoryProvision
          person={person}
          open={open}
          canProvision={google === "allowed"}
          onClose={() => setOpen(false)}
          refetch={refetch}
        />
      )}
    </section>
  );
}

function provisionMessage(state: NonNullable<Person["directoryProvision"]>) {
  if (state.status === "RUNNING") return "people.add.creating";
  if (state.status === "FAILED") return directoryProvisionFailure(state.failure);
  return "people.add.noAccount";
}

type ConfirmProps = {
  person: Person;
  open: boolean;
  canProvision: boolean;
  onClose: () => void;
  refetch: () => Promise<unknown>;
};

function ConfirmDirectoryProvision({ person, open, canProvision, onClose, refetch }: ConfirmProps) {
  const navigate = useNavigate({ from: "/people/$employeeId" });
  const [provision, { loading }] = usePayloadMutation(ProvisionEmployeeDocument);
  const allLoaded = !person.personApps.pageInfo.hasNextPage;
  const more = useQuery(DirectoryProvisionAppsDocument, {
    variables: { id: person.id },
    skip: !open || allLoaded,
    fetchPolicy: "network-only",
  });
  const edges = allLoaded ? person.personApps.edges : more.data?.employee?.personApps.edges;
  const apps = edges
    ?.map(({ node }) => node)
    .filter(({ state, app }) => state === "MISSING" && app.catalogKey !== GOOGLE_WORKSPACE);
  const conflict = apps?.find(({ roleConflict }) => roleConflict);

  function dismiss() {
    onClose();
    void navigate({ search: {}, replace: true });
  }

  async function confirm() {
    if (!canProvision || !apps || conflict) return;
    try {
      await provision({
        variables: { input: { employeeId: person.id, appIds: apps.map(({ app }) => app.id) } },
      });
      dismiss();
      void refetch().catch(() => undefined);
    } catch {
      toast.error(t("people.add.provisionFailed"));
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && !loading && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("people.add.confirmTitle", { name: person.firstName })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("people.add.confirmDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        {!!apps?.length && (
          <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
            {apps.map(({ app }) => (
              <li key={app.id}>
                {app.connected ? app.name : t("people.add.appByHand", { app: app.name })}
              </li>
            ))}
          </ul>
        )}
        {conflict && (
          <p role="status" className="text-sm">
            {t(
              hasRoleToPick(conflict)
                ? "people.provision.pickRoleFirst"
                : "people.provision.updateRoleFirst",
              { app: conflict.app.name },
            )}
          </p>
        )}
        {!apps && (
          <p role="status" className="text-sm">
            {t(more.error ? "people.add.loadFailed" : "people.add.loadingApps")}
            {more.error && (
              <Button
                type="button"
                variant="link"
                onClick={() => void more.refetch().catch(() => undefined)}
              >
                {t("templates.retry")}
              </Button>
            )}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t("apps.change.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            disabled={!canProvision || !apps || !!conflict || loading}
            onClick={() => void confirm()}
          >
            {t("people.provision.button")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type DeleteProps = { person: Person; refetch: () => Promise<unknown> };

function DeletePersonButton({ person, refetch }: DeleteProps) {
  const navigate = useNavigate({ from: "/people/$employeeId" });
  const [remove, deleting] = usePayloadMutation(DeletePersonDocument, {
    update: (cache, { data }) => {
      if (data?.apps.deletePerson.deleted) removeEmployee(cache, person.id);
    },
    refetch: [PeoplePageDocument],
  });
  async function deletePerson() {
    try {
      await remove({ variables: { employeeId: person.id } });
      await navigate({ to: "/people" });
    } catch {
      toast.error(t("people.add.deleteFailed"));
      await refetch().catch(() => undefined);
    }
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button type="button" variant="outline" disabled={deleting.loading} />}
      >
        {t("people.add.delete")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("people.add.deleteTitle", { name: person.firstName })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("people.add.deleteDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("apps.change.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            onClick={() => void deletePerson()}
          >
            {t("people.add.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
