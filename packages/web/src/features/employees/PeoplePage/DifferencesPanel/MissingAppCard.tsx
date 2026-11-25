import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { type PeopleDifferencesQuery, ProvisionAppDocument } from "@/__generated__/graphql";
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
import { CouldntChangeDialog } from "@/features/apps";
import { t } from "@/i18n";

type Missing = NonNullable<PeopleDifferencesQuery["accessDifferences"]["missing"]>[number];

type Props = {
  differences: Missing[];
  refresh: () => Promise<unknown>;
};

/** One Provision for the people missing this app, with each person's current action. */
export function MissingAppCard({ differences, refresh }: Props) {
  const [open, setOpen] = useState(false);
  const [provision, { loading: submitting }] = usePayloadMutation(ProvisionAppDocument);
  const { app, employee } = differences[0]!;
  const count = String(differences.length);
  const ready = differences.filter(
    (row) => row.provisionStep && !isRunning(row) && !row.roleNeedsAttention,
  );
  const isProvisioning = submitting || (!ready.length && differences.some(isRunning));
  const confirm = async () => {
    setOpen(false);
    try {
      const result = await provision({
        variables: {
          input: { appId: app.id, employeeIds: ready.map(({ employee }) => employee.id) },
        },
      });
      showRefusedPeople(ready, result.refusedEmployeeIds ?? []);
    } catch {
      toast.error(t("people.differences.provisionFailed", { app: app.name }));
    } finally {
      await refresh().catch(() => undefined);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
      <p className="text-[15px] font-semibold">
        {app.name} ·{" "}
        {differences.length === 1 ? (
          <Link
            to="/people/$employeeId"
            params={{ employeeId: employee.id }}
            className="hover:underline"
          >
            {personName(employee)}
          </Link>
        ) : (
          t("people.differences.peopleCount", { count })
        )}
      </p>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          render={<Button type="button" size="lg" className="px-4" disabled={submitting} />}
        >
          {t(isProvisioning ? "people.differences.provisioning" : "people.provision.button")}
        </AlertDialogTrigger>
        <AlertDialogContent className="p-6 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("people.differences.provisionTitle", { app: app.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("people.differences.provisionDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
            {open &&
              differences
                .toSorted((a, b) => personName(a.employee).localeCompare(personName(b.employee)))
                .map((row) => (
                  <li
                    key={row.employee.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <Link
                      to="/people/$employeeId"
                      params={{ employeeId: row.employee.id }}
                      className="font-semibold hover:underline"
                    >
                      {personName(row.employee)}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                      {row.latestProvisionChange?.status === "FAILED" &&
                        row.latestProvisionChange.failure !== "NO_CONNECTION" && (
                          <CouldntChangeDialog change={row.latestProvisionChange} />
                        )}
                      {needsPersonPage(row) ? (
                        <Link
                          to="/people/$employeeId"
                          params={{ employeeId: row.employee.id }}
                          className="underline"
                        >
                          {provisionLabel(row)}
                        </Link>
                      ) : (
                        provisionLabel(row)
                      )}
                    </div>
                  </li>
                ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("apps.change.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={!ready.length || submitting}
              onClick={() => void confirm()}
            >
              {t("people.provision.button")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function showRefusedPeople(people: readonly Missing[], ids: readonly string[]) {
  if (!ids.length) return;
  const refused = new Set(ids);
  const first = people.find(({ employee }) => refused.has(employee.id));
  if (!first) return;
  toast.error(
    t(
      ids.length === 1
        ? "people.differences.provisionRefusedOne"
        : "people.differences.provisionRefused",
      { name: personName(first.employee), count: String(ids.length) },
    ),
  );
}

function needsPersonPage(row: Missing) {
  return !isRunning(row) && (row.roleNeedsAttention || !row.provisionStep);
}

function isRunning(row: Missing) {
  return row.latestProvisionChange?.status === "RUNNING";
}

function personName(employee: Missing["employee"]) {
  return `${employee.firstName} ${employee.lastName}`;
}

function provisionLabel(row: Missing) {
  const { provisionStep, roleNeedsAttention, latestProvisionChange } = row;
  if (isRunning(row)) return t("people.differences.provisioning");
  if (roleNeedsAttention) return t("people.differences.fixRole");
  if (provisionStep?.action === "INVITE") return t("people.differences.invites");
  if (provisionStep?.action === "REACTIVATE") return t("people.provision.enable");
  if (provisionStep?.action === "GIVE_BY_HAND") return t("people.differences.byHand");
  if (latestProvisionChange?.failure === "NO_CONNECTION")
    return t("people.differences.finishByHand");
  return t("people.differences.provisionUnavailable");
}
