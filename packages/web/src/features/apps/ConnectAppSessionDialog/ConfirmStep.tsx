import type { AppSessionHandOverQuery } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n";

import type { AppSessionConnector } from "./ConnectAppSessionSteps";
import type { useConnectAppSession } from "./useConnectAppSession";

type Props = {
  connector: Pick<AppSessionConnector, "id" | "name">;
  handOver: NonNullable<AppSessionHandOverQuery["appSessionHandOver"]>;
  connection: ReturnType<typeof useConnectAppSession>;
  /** Whether the integration user's sign-in made the session, not the owner's hand-over. */
  isIntegrationUser?: boolean;
  /** Back to signing in, such as to switch workspaces in the app; Cancel for the integration user. */
  onBack: () => void;
  onConnected: () => void;
};

/** Step 5: the workspace the handed-over session opens, which the owner confirms to connect. */
export function ConfirmStep({
  connector,
  handOver,
  connection,
  isIntegrationUser = false,
  onBack,
  onConnected,
}: Props) {
  const [connect, { loading, error, payloadError }] = connection;
  const app = connector.name;
  const workspace = handOver.organizationName;
  const confirm = () => {
    const input = {
      connector: connector.id,
      appSession: handOver.appSession,
      noticeAccepted: true,
    };
    // `usePayloadMutation` keeps a failure for display, so the rejection needs no handling here.
    connect({ variables: { input } }).then(onConnected, () => undefined);
  };
  const failure = connectFailure(app, payloadError, error !== undefined);

  return (
    <>
      <DialogHeader className="gap-3">
        <div className="flex items-center gap-3 pr-8">
          <AppMark name={app} catalogKey={connector.id} className="size-9 rounded-lg text-base" />
          <DialogTitle className="text-xl font-semibold">
            {t("settings.appSession.confirmTitle", { workspace })}
          </DialogTitle>
        </div>
        <DialogDescription className="text-sm text-foreground/80">
          {t(
            isIntegrationUser
              ? "settings.appSession.confirmBodyIntegrationUser"
              : "settings.appSession.confirmBody",
            { app },
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-4 rounded-xl border-2 border-foreground px-4 py-3.5">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-semibold"
        >
          {workspace.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold">{workspace}</span>
          {handOver.domain && (
            <span className="text-sm text-muted-foreground">{handOver.domain}</span>
          )}
        </div>
      </div>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-foreground/80">
        <li>{t("settings.appSession.approvesNow", { app })}</li>
        <li>{t("settings.appSession.readsDaily")}</li>
      </ul>
      <p className="text-[13px] text-muted-foreground">
        {t(
          isIntegrationUser
            ? "settings.appSession.notThisWorkspaceIntegrationUser"
            : "settings.appSession.notThisWorkspace",
          { app },
        )}
      </p>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <DialogFooter className="m-0 flex-row justify-end gap-2 border-0 bg-transparent p-0">
        <Button type="button" variant="outline" size="lg" disabled={loading} onClick={onBack}>
          {t(isIntegrationUser ? "settings.apps.dialog.cancel" : "settings.appSession.back")}
        </Button>
        <Button type="button" size="lg" disabled={loading} onClick={confirm}>
          {loading
            ? t("settings.apps.dialog.connecting")
            : t("settings.appSession.connectWorkspace", { workspace })}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Why connecting failed: the hand-over expired, the app refused the session, or it could not answer. */
function connectFailure(
  app: string,
  payloadError: { __typename: string; fields?: { field: string; code: string }[] } | null,
  failedOtherwise: boolean,
): string | undefined {
  if (payloadError?.__typename === "InvalidInputError") {
    const code = payloadError.fields?.find(({ field }) => field === "appSession")?.code;
    if (code === "wrong_workspace") {
      return t("settings.appSession.otherWorkspace", { app });
    }
    return code === "invalid" || code === "required"
      ? t("settings.appSession.expired", { app })
      : t("settings.appSession.refused", { app });
  }
  if (payloadError?.__typename === "UnavailableError") {
    return t("settings.apps.dialog.unavailable", { app });
  }
  return payloadError || failedOtherwise ? t("settings.apps.dialog.failed", { app }) : undefined;
}
