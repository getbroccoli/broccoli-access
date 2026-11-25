import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { ArrowUpRight, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import {
  type AccountChangeAction,
  type CouldntChangeDialog_AccountChangeFragment,
  CouldntChangeDialog_AccountChangeFragmentDoc,
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

import { integrationUserOf } from "../reconnectReason";
import { ReconnectButton } from "../ReconnectButton";
import { couldntChangeHint, couldntChangeReason, failedChangeOptions } from "./couldntChange";
import { DoneByHandDialog } from "./DoneByHandDialog";
import { type ChangeTarget, changeTargetOf, useChangeAccount } from "./useChangeAccount";

type Props = {
  /** A failed account change. */
  change: FragmentType<CouldntChangeDialog_AccountChangeFragment>;
  /**
   * The row whose latest change it is, which Try again and I did it by hand act on: the account, or
   * the employee's invite row, offering INVITE while Invite is offered; absent where the change is
   * history, as on Activity, which shows only why.
   */
  row?: {
    id: string;
    /** How the row names an account without an employee; its email otherwise. */
    name?: string | null;
    roleConflict?: boolean;
    offeredChange?: AccountChangeAction | null;
    offersRemove?: boolean;
    onlyIfExtra?: boolean;
  };
  /**
   * Called once Try again was asked or the change was marked done by hand, by a row of an account
   * without an employee, which the answers do not carry.
   */
  onChanged?: () => void;
  /** The trigger's look; the account row's chip by default. */
  triggerClassName?: string;
};

/**
 * "Couldn't disable" or "Couldn't enable", opening why: who asked and when, the reason, the app's
 * admin page and, for an account, what helps now: Try again, I did it by hand (confirmed in its own
 * dialog), or a scan.
 */
export function CouldntChangeDialog({
  change: changeRef,
  row,
  onChanged,
  triggerClassName = CHIP,
}: Props) {
  const fragment = useFragment({
    fragment: CouldntChangeDialog_AccountChangeFragmentDoc,
    // The document also holds the fragments of the Reconnect button, which this one spreads.
    fragmentName: "CouldntChangeDialog_accountChange",
    from: changeRef,
  });
  const [shown, setShown] = useState<"reason" | "byHand" | null>(null);
  const { changeAccount } = useChangeAccount();
  const [scanNow] = usePayloadMutation(ScanNowDocument);
  const change = fragment.complete ? fragment.data : null;
  if (!change?.failure) {
    return null;
  }
  const { employee, app } = change;
  const connection = app.containerConnection;
  const accountName = row?.name ?? change.email;
  const name = employee ? `${employee.firstName} ${employee.lastName}` : accountName;
  const firstName = employee?.firstName ?? accountName;
  const workspace = connection?.scan?.sourceName ?? app.name;
  const options = row ? failedChangeOptions({ ...row, latestChange: change, app }) : NO_OPTIONS;
  const copy = COPY[change.action];
  const reason = couldntChangeReason(change.failure, {
    action: change.action,
    canDisableAccounts: connection?.connector.canDisableAccounts,
    app: app.name,
    workspace,
    person: { name, email: change.email },
    // Today's connection user says nothing about who it was when a change in history failed.
    connectionUserEmail: row ? (connection?.connectionUserEmail ?? null) : null,
    credential: connection?.connector.connectionFields.find(({ secret }) => secret)?.kind ?? "TEXT",
    toReconnect: options.reconnect,
    // Today's connection says nothing about who a change in history was made as.
    integrationUser: row && connection ? integrationUserOf(connection) : null,
    historical: !row,
  });
  const tryAgain = (target: ChangeTarget) => {
    setShown(null);
    void changeAccount(
      target,
      change.action,
      change.action === "REMOVE" ? change.id : undefined,
    ).then(onChanged);
  };
  const target = row && rowTarget(row.id, change, name, row.onlyIfExtra);
  const scan = (connectionId: string) => {
    setShown(null);
    scanNow({ variables: { connectionId } }).catch(() => toast.error(t("scans.scanNowFailed")));
  };

  return (
    <>
      <Dialog open={shown === "reason"} onOpenChange={(open) => setShown(open ? "reason" : null)}>
        <DialogTrigger
          render={<button type="button" className={triggerClassName} />}
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
              {row &&
                stillHasAccess(change) &&
                ` ${t("apps.couldnt.stillHasAccess", { firstName, workspace })}`}
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {reason}
          </p>
          {row && (
            <p className="text-sm text-muted-foreground">
              {couldntChangeHint(change.failure, change.action, options, {
                firstName,
                roleConflict: row.roleConflict,
                app: app.name,
                canDisableAccounts: connection?.connector.canDisableAccounts,
              })}
            </p>
          )}
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
            {target && options.tryAgain && (
              <Button type="button" size="lg" className="px-4" onClick={() => tryAgain(target)}>
                {t("apps.couldnt.tryAgain")}
              </Button>
            )}
            {options.reconnect && connection && (
              <ReconnectButton
                connector={connection.connector}
                label={t("apps.reconnect.appButton", { app: app.name })}
              />
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
            {!options.tryAgain && !options.scanNow && !options.reconnect && (
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
        person={{ name, firstName }}
        app={app.name}
        onDone={onChanged}
      />
    </>
  );
}

const CHIP = cn(
  "inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-red-800",
  "cursor-pointer transition-colors hover:bg-red-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
);

/** History offers no action: Try again and I did it by hand act on an account's latest change. */
const NO_OPTIONS = { tryAgain: false, byHand: false, scanNow: false, reconnect: false };

/** The words of a failed Disable, Enable or Invite, which mirror each other. */
const COPY = {
  SUSPEND: {
    chip: "apps.couldnt.disable",
    title: "apps.couldnt.disableTitle",
  },
  REACTIVATE: {
    chip: "apps.couldnt.enable",
    title: "apps.couldnt.enableTitle",
  },
  REMOVE: { chip: "apps.couldnt.remove", title: "apps.couldnt.removeTitle" },
  INVITE: {
    chip: "apps.couldnt.invite",
    title: "apps.couldnt.inviteTitle",
  },
} as const;

type FailedChange = CouldntChangeDialog_AccountChangeFragment;

/** What Try again asks for: an invite goes to an employee; an account without one goes by its email. */
function rowTarget(
  rowId: string,
  { action, employee, app }: FailedChange,
  name: string,
  onlyIfExtra?: boolean,
) {
  if (employee) {
    return changeTargetOf({ id: rowId, employee, app }, action, onlyIfExtra);
  }
  return action === "INVITE" ? undefined : { name, app: app.name, accountId: rowId };
}

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
