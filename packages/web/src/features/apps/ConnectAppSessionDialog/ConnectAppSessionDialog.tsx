import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { type ReactElement, useState } from "react";

import {
  type ConnectAppSessionDialog_ConnectorFragment,
  ConnectAppSessionDialog_ConnectorFragmentDoc,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { t } from "@/i18n";

import { ConnectAppSessionSteps } from "./ConnectAppSessionSteps";
import { ConnectHeader } from "./ConnectHeader";
import { type ConnectWay, ConnectWayStep } from "./ConnectWayStep";
import { IntegrationUserConnectStep } from "./IntegrationUserConnectStep";
import { NoticeStep } from "./NoticeStep";
import { useConnectAppSession } from "./useConnectAppSession";
import { useConnectWithIntegrationUser } from "./useConnectWithIntegrationUser";

type Props = {
  connector: FragmentType<ConnectAppSessionDialog_ConnectorFragment>;
  /** The button that opens it while the app is not connected; "Connect <app>" by default. */
  trigger?: ReactElement;
  /** Runs once the app is connected, for a page showing what only the server computes. */
  onConnected?: () => void;
};

/**
 * Connect <app> for an app that needs a session: as the integration user, where its connector can
 * sign in, or with the owner's own session, which the extension hands over. Once connected with
 * the owner's own session, it is Switch, to the integration user.
 */
export function ConnectAppSessionDialog({ connector: from, trigger, onConnected }: Props) {
  const { data: connector, complete } = useFragment({
    fragment: ConnectAppSessionDialog_ConnectorFragmentDoc,
    from,
  });
  const [open, setOpen] = useState(false);
  // What the owner chose; "notice" is the integration user's way before its notice is accepted.
  const [way, setWay] = useState<ConnectWay | "notice" | null>(null);
  const connection = useConnectAppSession();
  const signIn = useConnectWithIntegrationUser();
  if (!complete) {
    return null;
  }
  const app = connector.name;
  const stored = connector.connection;
  const isSwitching = stored !== null;
  const offersSwitch = stored?.sessionFrom === "EXTENSION" && connector.signsInAsIntegrationUser;
  const changeOpen = (next: boolean) => {
    // Closed only once Connect ends, so its result always has a place to show.
    if (connection[1].loading) {
      return;
    }
    setOpen(next);
    // The integration user's sign-in carries on while closed, and shows again when reopened.
    if (!signIn[1].loading) {
      setWay(null);
      connection[1].reset();
      signIn[1].reset();
    }
  };
  const connectAsIntegrationUser = () => {
    setWay("integrationUser");
    const input = { connector: connector.id, noticeAccepted: true };
    // `usePayloadMutation` keeps a failure for display, so the rejection needs no handling here.
    signIn[0]({ variables: { input } }).then(onConnected, () => undefined);
  };
  const choose = (chosen: ConnectWay) => {
    if (chosen === "ownSession") {
      setWay(chosen);
    } else if (connector.notice !== null && !isSwitching) {
      setWay("notice");
    } else {
      connectAsIntegrationUser();
    }
  };
  const openButton = stored
    ? offersSwitch && (
        <Button type="button" variant="outline" size="lg" className="px-4">
          {t("settings.connectWay.switch")}
        </Button>
      )
    : (trigger ?? (
        <Button type="button" size="lg" className="px-4">
          {t("settings.apps.connect", { app })}
        </Button>
      ));

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {openButton && <DialogTrigger render={openButton} />}
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-lg">
        {open && way === null && connector.signsInAsIntegrationUser && (
          <ConnectWayStep connector={connector} isSwitching={isSwitching} onChoose={choose} />
        )}
        {open && way === "notice" && connector.notice !== null && (
          <>
            <ConnectHeader connector={connector} title={t("settings.apps.connect", { app })} />
            <NoticeStep app={app} notice={connector.notice} onAccept={connectAsIntegrationUser} />
          </>
        )}
        {open && way === "integrationUser" && (
          <IntegrationUserConnectStep
            connector={connector}
            signIn={signIn}
            isScanning={stored?.scan?.status === "SCANNING"}
            onTryAgain={connectAsIntegrationUser}
          />
        )}
        {/* Mounted while open, so each opening starts again from the first step not done. */}
        {open &&
          (way === "ownSession" || (way === null && !connector.signsInAsIntegrationUser)) && (
            <ConnectAppSessionSteps
              connector={connector}
              connection={connection}
              onConnected={() => {
                setOpen(false);
                onConnected?.();
              }}
            />
          )}
      </DialogContent>
    </Dialog>
  );
}
