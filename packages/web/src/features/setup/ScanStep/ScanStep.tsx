import { useQuery } from "@apollo/client/react";
import { useEffect } from "react";

import { SetupScanDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { SetupLayout } from "../SetupLayout";
import { scanStepHints, type ScanSteps } from "./scanStepHints";
import { ScanStepRow } from "./ScanStepRow";

/** How often the page asks for the scan's progress while it runs. */
const POLL_INTERVAL_MS = 1_000;

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
  const steps = connection?.scan ?? STARTING_SCAN;
  const hints = scanStepHints(steps);
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
            state={steps.people.state}
            title={t("setup.scan.readingPeople")}
            hint={hints.people}
          />
          <ScanStepRow
            state={steps.apps.state}
            title={t("setup.scan.findingApps")}
            hint={hints.apps}
          />
          <ScanStepRow
            state={steps.signInLogs.state}
            title={t("setup.scan.readingLogs")}
            hint={hints.signInLogs}
          />
        </ol>
      )}
    </SetupLayout>
  );
}
