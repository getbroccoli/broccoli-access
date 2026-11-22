import { useQuery } from "@apollo/client/react";
import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useEffect } from "react";

import { SetupScanDocument, type SetupScanQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";
import { cn } from "@/lib/class-names";

import { SetupLayout } from "./SetupLayout";

/** How often the page asks for the scan's progress while it runs. */
const POLL_INTERVAL_MS = 1_000;

/** The steps a later scan adds; they wait until the scan reads apps. */
const WAITING_PARTS: MessageKey[] = ["setup.scan.findingApps", "setup.scan.readingLogs"];

type PeopleStep = NonNullable<
  NonNullable<SetupScanQuery["setup"]["googleWorkspace"]>["scan"]
>["people"];

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
  const people: PeopleStep = connection?.scan?.people ?? {
    state: "RUNNING",
    count: null,
    suspended: null,
  };
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
          <li className="flex items-center gap-5 px-6 py-5">
            {people.state === "DONE" ? (
              <CheckCircle size={22} weight="fill" className="shrink-0 text-brand" aria-hidden />
            ) : people.state === "FAILED" ? (
              <WarningCircle
                size={22}
                weight="fill"
                className="shrink-0 text-destructive"
                aria-hidden
              />
            ) : (
              <CircleNotch
                size={22}
                className="shrink-0 animate-spin text-muted-foreground"
                aria-hidden
              />
            )}
            <span className="flex flex-col gap-0.5" aria-live="polite">
              <span className="text-[15px] font-medium text-foreground">
                {t("setup.scan.readingPeople")}
              </span>
              <span
                className={cn(
                  "text-sm",
                  people.state === "FAILED" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {peopleHint(people)}
              </span>
            </span>
          </li>
          {WAITING_PARTS.map((title) => (
            <li key={title} className="flex items-center gap-5 px-6 py-5">
              <span aria-hidden className="mx-[6px] size-2.5 shrink-0 rounded-full bg-border" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-medium text-foreground/70">{t(title)}</span>
                <span className="text-sm text-muted-foreground">{t("setup.scan.waiting")}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </SetupLayout>
  );
}

function peopleHint({ state, count, suspended }: PeopleStep): string {
  if (state === "FAILED") {
    return t("setup.scan.readingPeopleFailed");
  }
  if (state === "DONE" && count !== null && suspended !== null) {
    return t("setup.scan.peopleRead", { count: String(count), suspended: String(suspended) });
  }
  return t("setup.scan.readingPeopleHint");
}
