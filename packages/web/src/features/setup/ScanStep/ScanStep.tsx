import { useQuery } from "@apollo/client/react";
import { useEffect } from "react";

import {
  SetupScanDocument,
  type ScanStepState,
  type SetupScanQuery,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { SetupLayout } from "../SetupLayout";
import { ScanStepRow } from "./ScanStepRow";

/** How often the page asks for the scan's progress while it runs. */
const POLL_INTERVAL_MS = 1_000;

type ScanSteps = Pick<
  NonNullable<NonNullable<SetupScanQuery["setup"]["googleWorkspace"]>["scan"]>,
  "people" | "apps" | "signInLogs"
>;

/** The steps before the scan's first answer: the people are being read. */
const STARTING_SCAN: ScanSteps = {
  people: { state: "RUNNING", count: null, suspended: null },
  apps: { state: "WAITING", count: null },
  signInLogs: { state: "WAITING" },
};

/** Setup's second step, where the owner lands after connecting Google: the scan of their workspace. */
export function ScanStep() {
  const { data, error, refetch, startPolling, stopPolling } = useQuery(SetupScanDocument);
  const connection = data?.setup.googleWorkspace;
  const finished = connection?.scan != null && connection.scan.status !== "SCANNING";
  useEffect(() => {
    if (finished) {
      return;
    }
    startPolling(POLL_INTERVAL_MS);
    return stopPolling;
  }, [finished, startPolling, stopPolling]);
  const { people, apps, signInLogs } = connection?.scan ?? STARTING_SCAN;
  return (
    <SetupLayout
      step="scan"
      title={
        connection ? t("setup.scan.heading", { domain: connection.domain }) : t("setup.scan.title")
      }
      description={
        connection ? t("setup.scan.description", { email: connection.adminEmail }) : undefined
      }
    >
      {error && !connection ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("setup.scan.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("setup.connect.retry")}
          </Button>
        </div>
      ) : (
        <ol className="max-w-[720px] divide-y divide-border rounded-xl border border-border">
          <ScanStepRow
            state={people.state}
            title={t("setup.scan.readingPeople")}
            hint={peopleHint(people)}
          />
          <ScanStepRow
            state={apps.state}
            title={t("setup.scan.findingApps")}
            hint={laterStepHint(apps.state, appsFound(apps.count ?? 0))}
          />
          <ScanStepRow
            state={signInLogs.state}
            title={t("setup.scan.readingLogs")}
            hint={laterStepHint(signInLogs.state, t("setup.scan.logsRead"))}
          />
        </ol>
      )}
    </SetupLayout>
  );
}

function peopleHint({ state, count, suspended }: ScanSteps["people"]): string {
  if (state === "FAILED") {
    return t("setup.scan.readingPeopleFailed");
  }
  if (state === "DONE" && count !== null && suspended !== null) {
    return t("setup.scan.peopleRead", { count: String(count), suspended: String(suspended) });
  }
  return t("setup.scan.readingPeopleHint");
}

/** A step after the people's: waiting, `done` once it finished, or stopped by a failed scan. */
function laterStepHint(state: ScanStepState, done: string): string {
  if (state === "FAILED") {
    return t("setup.scan.stopped");
  }
  return state === "DONE" ? done : t("setup.scan.waiting");
}

function appsFound(count: number): string {
  return count === 1
    ? t("setup.scan.oneAppFound")
    : t("setup.scan.appsFound", { count: String(count) });
}
