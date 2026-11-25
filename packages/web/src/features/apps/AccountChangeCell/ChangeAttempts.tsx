import type {
  AccountChangeFailure,
  AccountChangeRuntime,
  CouldntChangeDialog_AccountChangeFragment,
} from "@/__generated__/graphql";
import { type MessageKey, t } from "@/i18n";
import { dayAndTime } from "@/lib/dayAndTime";

type Props = {
  attempts: CouldntChangeDialog_AccountChangeFragment["attempts"];
};

/** The change's log: each way it was tried, when, and what went wrong. */
export function ChangeAttempts({ attempts }: Props) {
  if (!attempts.length) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium">{t("apps.couldnt.tries")}</h3>
      <ol className="flex flex-col gap-1 text-sm text-muted-foreground">
        {attempts.map(({ at, runtime, failure }) => (
          <li key={`${at}-${runtime}`}>
            {[
              triedAt(at),
              t(RUNTIMES[runtime]),
              t(failure ? FAILURES[failure] : "apps.couldnt.tryWorked"),
            ].join(" · ")}
          </li>
        ))}
      </ol>
    </section>
  );
}

function triedAt(at: string): string {
  const { day, time } = dayAndTime(at);
  return day === null
    ? t("apps.couldnt.triedToday", { time })
    : t("apps.couldnt.triedOn", { day, time });
}

const RUNTIMES: Record<AccountChangeRuntime, MessageKey> = {
  SERVER: "apps.activity.onServer",
  OWNER_BROWSER: "apps.couldnt.inOwnerBrowser",
};

/** A short name for each error, as the log lists it. */
const FAILURES: Record<AccountChangeFailure, MessageKey> = {
  AUTHENTICATION_FAILED: "apps.couldnt.failure.authenticationFailed",
  PERMISSION_MISSING: "apps.couldnt.failure.permissionMissing",
  WRONG_WORKSPACE: "apps.couldnt.failure.wrongWorkspace",
  RATE_LIMITED: "apps.couldnt.failure.rateLimited",
  APP_UNAVAILABLE: "apps.couldnt.failure.appUnavailable",
  UNEXPECTED_RESPONSE: "apps.couldnt.failure.unexpectedResponse",
  BLOCKED_BY_CHECK: "apps.couldnt.failure.blockedByCheck",
  OWNER_BROWSER_LOST: "apps.couldnt.failure.ownerBrowserLost",
  ACCOUNT_NOT_FOUND: "apps.couldnt.failure.accountNotFound",
  NOT_ALLOWED: "apps.couldnt.failure.notAllowed",
  NO_CONNECTION: "apps.couldnt.failure.noConnection",
};
