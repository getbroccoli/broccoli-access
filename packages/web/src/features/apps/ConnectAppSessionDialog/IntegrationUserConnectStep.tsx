import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { t, type MessageKey } from "@/i18n";
import { cn } from "@/lib/class-names";

import { ConnectHeader } from "./ConnectHeader";
import type { useConnectWithIntegrationUser } from "./useConnectWithIntegrationUser";

type Props = {
  connector: { id: string; name: string };
  signIn: ReturnType<typeof useConnectWithIntegrationUser>;
  /** Whether the connection's scan still reads the members. */
  isScanning: boolean;
  onTryAgain: () => void;
};

/**
 * Broccoli Access connecting by itself as the integration user: accepting the invitation and
 * signing in, which the connector does in one go, then reading the members; or why it stopped and
 * what to do.
 */
export function IntegrationUserConnectStep({ connector, signIn, isScanning, onTryAgain }: Props) {
  const [, { loading, error, payloadError }] = signIn;
  const app = connector.name;
  const failure = failureOf(payloadError, error !== undefined);
  const signedIn: StepStatus = loading ? "working" : failure ? "next" : "done";
  const steps: { label: MessageKey; status: StepStatus }[] = [
    { label: "settings.integrationUserConnect.stepInvitation", status: signedIn },
    { label: "settings.integrationUserConnect.stepSignIn", status: signedIn },
    {
      label: "settings.integrationUserConnect.stepMembers",
      status: signedIn !== "done" ? "next" : isScanning ? "working" : "done",
    },
  ];

  return (
    <>
      <ConnectHeader
        connector={connector}
        title={t("settings.integrationUserConnect.title", { app })}
      />
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
              className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", BADGES[status].style)}
            >
              {t(BADGES[status].label)}
            </span>
          </li>
        ))}
      </ol>
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {t(failure, { app })}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {t("settings.integrationUserConnect.canClose", { app })}
        </p>
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

type StepStatus = "done" | "working" | "next";

const BADGES: Record<StepStatus, { label: MessageKey; style: string }> = {
  done: { label: "settings.integrationUserConnect.done", style: "bg-brand-soft text-brand-deep" },
  working: { label: "settings.integrationUserConnect.working", style: "bg-blue-100 text-blue-900" },
  next: { label: "settings.integrationUserConnect.next", style: "bg-muted text-foreground/70" },
};

/** Why signing in stopped, with what the owner does about it; undefined while it runs or once it is done. */
function failureOf(
  payloadError: { __typename: string; fields?: { field: string; code: string }[] } | null,
  failedOtherwise: boolean,
): MessageKey | undefined {
  const code = payloadError?.fields?.find(({ field }) => field === "integrationUser")?.code;
  if (code && code in FAILURES) {
    return FAILURES[code];
  }
  return payloadError || failedOtherwise ? "settings.integrationUserConnect.failed" : undefined;
}

/** The sign-in failures the owner can put right, by the API's code. */
const FAILURES: Partial<Record<string, MessageKey>> = {
  not_invited: "settings.integrationUserConnect.notInvited",
  permission_missing: "settings.integrationUserConnect.notAdmin",
  blocked_by_check: "settings.integrationUserConnect.blockedByCheck",
  authentication_failed: "settings.integrationUserConnect.authenticationFailed",
  wrong_workspace: "settings.integrationUserConnect.otherWorkspace",
  not_set_up: "settings.integrationUserConnect.notSetUp",
};
