import type { ScanStepState, SetupScanQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";

/** The scan's three steps, as the scan page reads them. */
export type ScanSteps = Pick<
  NonNullable<NonNullable<SetupScanQuery["setup"]["googleWorkspace"]>["scan"]>,
  "people" | "apps" | "signInLogs"
>;

/** What each step of the scan says under its title: what it reads, what it found, or that it stopped. */
export function scanStepHints({ people, apps, signInLogs }: ScanSteps) {
  return {
    people: peopleHint(people),
    apps: laterStepHint(apps.state, appsFound(apps.count ?? 0)),
    signInLogs: laterStepHint(signInLogs.state, t("setup.scan.logsRead")),
  };
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
