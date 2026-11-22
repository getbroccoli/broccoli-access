import { useState } from "react";

import type { ContainerConnectorsSettingsQuery } from "@/__generated__/graphql";
import { AppMark } from "@/components/AppMark";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n";
import { useChromeExtension } from "@/lib/useChromeExtension";

import { ConfirmStep } from "./ConfirmStep";
import { ExtensionStep } from "./ExtensionStep";
import { NoticeStep } from "./NoticeStep";
import { PairStep } from "./PairStep";
import { SignInStep } from "./SignInStep";
import { type ConnectStep, StepList } from "./StepList";
import { useAppSessionHandOver } from "./useAppSessionHandOver";
import type { useConnectAppSession } from "./useConnectAppSession";

export type AppSessionConnector = Pick<
  ContainerConnectorsSettingsQuery["containerConnectors"][number],
  "id" | "name" | "appDomain" | "notice"
>;

type Props = {
  connector: AppSessionConnector;
  connection: ReturnType<typeof useConnectAppSession>;
  onConnected: () => void;
};

/**
 * The steps of connecting an app with the owner's app session: install the extension, pair it,
 * accept the app's notice, sign in and hand the session over, then confirm the workspace. A step
 * already done is skipped.
 */
export function ConnectAppSessionSteps({ connector, connection, onConnected }: Props) {
  const extension = useChromeExtension();
  const handOver = useAppSessionHandOver(connector.id);
  const [isNoticeAccepted, setNoticeAccepted] = useState(connector.notice === null);
  const app = connector.name;
  const step = currentStep(extension, isNoticeAccepted);

  if (handOver.handOver) {
    return (
      <ConfirmStep
        connector={connector}
        handOver={handOver.handOver}
        connection={connection}
        onBack={handOver.reset}
        onConnected={onConnected}
      />
    );
  }
  return (
    <>
      <DialogHeader className="gap-3">
        <div className="flex items-center gap-3 pr-8">
          <AppMark name={app} catalogKey={connector.id} className="size-9 rounded-lg text-base" />
          <DialogTitle className="text-xl font-semibold">
            {t("settings.apps.connect", { app })}
          </DialogTitle>
        </div>
      </DialogHeader>
      <StepList hasNotice={connector.notice !== null} current={step} />
      {step === null && extension.loadFailed && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{t("settings.extension.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={extension.retry}>
            {t("settings.connections.retry")}
          </Button>
        </div>
      )}
      {step === "extension" && <ExtensionStep app={app} />}
      {step === "pair" && <PairStep extension={extension} />}
      {step === "notice" && connector.notice !== null && (
        <NoticeStep app={app} notice={connector.notice} onAccept={() => setNoticeAccepted(true)} />
      )}
      {step === "signIn" && <SignInStep connector={connector} handOver={handOver} />}
    </>
  );
}

/**
 * The first step not done yet; null while the page still checks for the extension. This Chrome's
 * own extension decides the first step, since a pairing made in another Chrome hands nothing over.
 */
function currentStep(
  { status, isInstalled }: ReturnType<typeof useChromeExtension>,
  isNoticeAccepted: boolean,
): ConnectStep | null {
  if (status === "checking" || isInstalled === null) {
    return null;
  }
  if (!isInstalled) {
    return "extension";
  }
  if (status !== "paired") {
    return "pair";
  }
  return isNoticeAccepted ? "signIn" : "notice";
}
