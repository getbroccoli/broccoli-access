import { useQuery } from "@apollo/client/react";

import { ContainerConnectorScansDocument, type ScanStatus } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { t, type MessageKey } from "@/i18n";
import { cn } from "@/lib/class-names";

import { ConnectHeader } from "./ConnectHeader";
import { failureOf } from "./integrationUserFailure";
import type { useConnectWithIntegrationUser } from "./useConnectWithIntegrationUser";

type Props = {
  connector: { id: string; name: string };
  signIn: ReturnType<typeof useConnectWithIntegrationUser>;
  /** Whether it switches a connected app to the integration user, instead of connecting it. */
  isSwitch: boolean;
  onTryAgain: () => void;
};

/**
 * Broccoli Access connecting by itself as the integration user: accepting the invitation and
 * signing in, which the connector does in one go, then reading the members; or why it stopped and
 * what to do.
 */
export function IntegrationUserConnectStep({ connector, signIn, isSwitch, onTryAgain }: Props) {
  const [, { loading, error, payloadError }] = signIn;
  const app = connector.name;
  const failure = failureOf(payloadError, error !== undefined);
  const signedIn: StepStatus = loading ? "working" : failure ? "next" : "done";
  // The connection's scan as the cache holds it: the shell's scan watcher keeps it current.
  const scans = useQuery(ContainerConnectorScansDocument, {
    skip: signedIn !== "done",
    fetchPolicy: "cache-first",
  });
  const scan = scans.data?.containerConnectors.find(({ id }) => id === connector.id)?.connection
    ?.scan;
  const members = membersStatus(signedIn, scan?.status);
  const steps: { label: MessageKey; status: StepStatus }[] = [
    { label: "settings.integrationUserConnect.stepInvitation", status: signedIn },
    { label: "settings.integrationUserConnect.stepSignIn", status: signedIn },
    { label: "settings.integrationUserConnect.stepMembers", status: members },
  ];
  const note = NOTES[isSwitch ? "switch" : "connect"][members];

  return (
    <>
      <ConnectHeader
        connector={connector}
        title={t(
          isSwitch
            ? "settings.integrationUserConnect.switchTitle"
            : "settings.integrationUserConnect.title",
          { app },
        )}
      />
      {/* A sign-in that stopped has no step under way: only its reason shows. */}
      {!failure && (
        <ol className="divide-y divide-border rounded-xl border border-border" aria-live="polite">
          {steps.map(({ label, status }) => (
            <li key={label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span
                className={cn(
                  status === "working" && "font-semibold",
                  status === "next" && "text-muted-foreground",
                )}
              >
                {t(label, { app })}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  BADGES[status].style,
                )}
              >
                {t(BADGES[status].label)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {t(failure, { app })}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">{t(note, { app })}</p>
      )}
      <DialogFooter className="m-0 flex-row justify-end gap-2 border-0 bg-transparent p-0">
        <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
          {t("settings.integrationUserConnect.close")}
        </DialogClose>
        {failure && (
          <Button type="button" size="lg" onClick={onTryAgain}>
            {t("settings.integrationUserConnect.tryAgain")}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

type StepStatus = "done" | "working" | "next" | "failed";

/** What the dialog says under the steps, by how reading the members stands. */
const NOTES: Record<"connect" | "switch", Record<StepStatus, MessageKey>> = {
  connect: {
    next: "settings.integrationUserConnect.canClose",
    working: "settings.integrationUserConnect.canClose",
    done: "settings.integrationUserConnect.connected",
    failed: "settings.integrationUserConnect.membersNotRead",
  },
  switch: {
    next: "settings.integrationUserConnect.canCloseSwitch",
    working: "settings.integrationUserConnect.canCloseSwitch",
    done: "settings.integrationUserConnect.switched",
    failed: "settings.integrationUserConnect.membersNotRead",
  },
};

/** Where reading the members stands: after the sign-in, as the connection's scan goes. */
function membersStatus(signedIn: StepStatus, scan: ScanStatus | undefined): StepStatus {
  if (signedIn !== "done") {
    return "next";
  }
  if (scan === "SCAN_FAILED") {
    return "failed";
  }
  return scan === "SCANNED" ? "done" : "working";
}

const BADGES: Record<StepStatus, { label: MessageKey; style: string }> = {
  done: { label: "settings.integrationUserConnect.done", style: "bg-brand-soft text-brand-deep" },
  working: { label: "settings.integrationUserConnect.working", style: "bg-blue-100 text-blue-900" },
  next: { label: "settings.integrationUserConnect.next", style: "bg-muted text-foreground/70" },
  failed: {
    label: "settings.integrationUserConnect.failedStep",
    style: "bg-destructive/10 text-destructive",
  },
};
