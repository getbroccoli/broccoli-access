import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { ArrowUpRight, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import {
  type CouldntChangeDialog_AppUserFragment,
  CouldntChangeDialog_AppUserFragmentDoc,
  ScanNowDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { dayAndTime } from "@/lib/dayAndTime";

import { couldntChangeReason, failedChangeOptions } from "./couldntChange";
import { DoneByHandDialog } from "./DoneByHandDialog";
import { useChangeAccount } from "./useChangeAccount";

type Props = {
  /** An app account whose latest change failed. */
  appUser: FragmentType<CouldntChangeDialog_AppUserFragment>;
};

/**
 * "Couldn't disable" or "Couldn't enable" in the account's status cell, opening why: who asked and
 * when, the reason, and what helps now: Try again, I did it by hand (confirmed in its own dialog), the
 * app's admin page, or a scan.
 */
export function CouldntChangeDialog({ appUser }: Props) {
  const fragment = useFragment({ fragment: CouldntChangeDialog_AppUserFragmentDoc, from: appUser });
  const [shown, setShown] = useState<"reason" | "byHand" | null>(null);
  const { changeAccount } = useChangeAccount();
  const [scanNow] = usePayloadMutation(ScanNowDocument);
  const user = fragment.complete ? fragment.data : null;
  const change = user?.latestChange;
  if (!user || !change?.failure) {
    return null;
  }
  const { employee, app } = user;
  const connection = app.containerConnection;
  const name = `${employee.firstName} ${employee.lastName}`;
  const workspace = connection?.scan?.sourceName ?? app.name;
  const options = failedChangeOptions(user);
  const copy = COPY[change.action];
  const reason = couldntChangeReason(change.failure, {
    app: app.name,
    workspace,
    person: { name, email: employee.email },
    connectionUserEmail: connection?.connectionUserEmail ?? null,
    credential: connection?.connector.connectionFields.find(({ secret }) => secret)?.kind ?? "TEXT",
  });
  const tryAgain = () => {
    setShown(null);
    void changeAccount({ id: user.id, name, app: app.name }, change.action);
  };
  const scan = (connectionId: string) => {
    setShown(null);
    scanNow({ variables: { connectionId } }).catch(() => toast.error(t("scans.scanNowFailed")));
  };

  return (
    <>
      <Dialog open={shown === "reason"} onOpenChange={(open) => setShown(open ? "reason" : null)}>
        <DialogTrigger
          render={<button type="button" className={CHIP} />}
          aria-label={t(copy.title, { name, app: app.name })}
        >
          <WarningCircle size={13} weight="bold" aria-hidden />
          {t(copy.chip)}
        </DialogTrigger>
        <DialogContent className="gap-5 p-6 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="pr-8 text-xl font-semibold">
              {t(copy.title, { name, app: app.name })}
            </DialogTitle>
            <DialogDescription>
              {askedBy(change)}
              {stillHasAccess(change) &&
                ` ${t("apps.couldnt.stillHasAccess", { firstName: employee.firstName, workspace })}`}
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {reason}
          </p>
          <p className="text-sm text-muted-foreground">
            {hintOf(change.failure, options, {
              firstName: employee.firstName,
              app: app.name,
              copy,
            })}
          </p>
          <DialogFooter className="m-0 gap-2 border-0 bg-transparent p-0 sm:justify-between">
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {options.byHand && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="px-4"
                  onClick={() => setShown("byHand")}
                >
                  {t("apps.couldnt.byHand")}
                </Button>
              )}
              {connection?.adminUrl && (
                <a
                  href={connection.adminUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}
                >
                  {t("apps.page.openAdmin", { app: app.name })}
                  <ArrowUpRight size={14} aria-hidden />
                </a>
              )}
            </div>
            {options.tryAgain && (
              <Button type="button" size="lg" className="px-4" onClick={tryAgain}>
                {t("apps.couldnt.tryAgain")}
              </Button>
            )}
            {options.scanNow && connection && (
              <Button
                type="button"
                size="lg"
                className="px-4"
                disabled={connection.scan?.status === "SCANNING"}
                onClick={() => scan(connection.id)}
              >
                {t("apps.couldnt.scanNow", { app: app.name })}
              </Button>
            )}
            {!options.tryAgain && !options.scanNow && (
              <DialogClose render={<Button type="button" size="lg" className="px-4" />}>
                {t("apps.couldnt.close")}
              </DialogClose>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DoneByHandDialog
        open={shown === "byHand"}
        onClose={() => setShown(null)}
        change={change}
        person={{ name, firstName: employee.firstName }}
        app={app.name}
      />
    </>
  );
}

const CHIP = cn(
  "inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-red-800",
  "cursor-pointer transition-colors hover:bg-red-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
);

/** The words of a failed Disable or Enable, which mirror each other. */
const COPY = {
  SUSPEND: {
    chip: "apps.couldnt.disable",
    title: "apps.couldnt.disableTitle",
    hint: "apps.couldnt.hintDisable",
  },
  REACTIVATE: {
    chip: "apps.couldnt.enable",
    title: "apps.couldnt.enableTitle",
    hint: "apps.couldnt.hintEnable",
  },
} as const;

type FailedChange = NonNullable<CouldntChangeDialog_AppUserFragment["latestChange"]>;

/** "Asked by Mia Novak today at 10:14.", or on an earlier day. */
function askedBy({ requestedBy, requestedAt }: FailedChange): string {
  const { day, time } = dayAndTime(requestedAt);
  return day === null
    ? t("apps.couldnt.askedToday", { name: requestedBy.name, time })
    : t("apps.couldnt.askedOn", { name: requestedBy.name, day, time });
}

/** A failed Disable leaves the person their access; a member the app no longer lists says nothing either way. */
function stillHasAccess({ action, failure }: FailedChange): boolean {
  return action === "SUSPEND" && failure !== "ACCOUNT_NOT_FOUND";
}

/** What to do next, matching the options the dialog offers. */
function hintOf(
  failure: NonNullable<FailedChange["failure"]>,
  options: ReturnType<typeof failedChangeOptions>,
  words: { firstName: string; app: string; copy: (typeof COPY)[keyof typeof COPY] },
): string {
  const { firstName, app, copy } = words;
  if (failure === "ACCOUNT_NOT_FOUND") {
    return t(options.scanNow ? "apps.couldnt.hintScan" : "apps.couldnt.hintScanned", { app });
  }
  if (failure === "NOT_ALLOWED") {
    return t("apps.couldnt.hintByHandOnly", { app });
  }
  return t(copy.hint, { firstName, app });
}
