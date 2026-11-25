import { useQuery } from "@apollo/client/react";
import { useState } from "react";

import { ConnectWayIntegrationUserDocument } from "@/__generated__/graphql";
import { OptionCard } from "@/components/form";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { t } from "@/i18n";
import { usePollWhileScanning } from "@/lib/usePollWhileScanning";

import { ConnectHeader } from "./ConnectHeader";
import { IntegrationUserTitle } from "./IntegrationUserTitle";
import { NoIntegrationUserChoice } from "./NoIntegrationUserChoice";

/** How an app that needs a session connects: as the integration user, or with the owner's own session. */
export type ConnectWay = "integrationUser" | "ownSession";

type Props = {
  connector: { id: string; name: string };
  /** Whether the app is connected with the owner's own session, so only the integration user is offered. */
  isSwitching: boolean;
  onChoose: (way: ConnectWay) => void;
};

/**
 * The first step for an app the integration user can sign in to: choose who Broccoli Access acts
 * as. Without an integration user that signs in to Google, it offers to create or finish it.
 */
export function ConnectWayStep({ connector, isSwitching, onChoose }: Props) {
  // Read on each opening: the integration user may have been created since the last.
  const query = useQuery(ConnectWayIntegrationUserDocument, {
    fetchPolicy: "cache-and-network",
  });
  const { data, error } = query;
  const [way, setWay] = useState<ConnectWay>("integrationUser");
  const app = connector.name;
  const integrationUser = data?.setup.integrationUser;
  const isSettingUpSignIn = integrationUser?.signInStatus === "SETTING_UP_TWO_STEP_SIGN_IN";
  usePollWhileScanning(isSettingUpSignIn, query);
  const signsIn = integrationUser?.signInStatus === "SIGNS_IN_WITH_TWO_STEP_SIGN_IN";
  const title = t(isSwitching ? "settings.connectWay.switchTitle" : "settings.apps.connect", {
    app,
  });
  const cancel = (
    <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
      {t("settings.apps.dialog.cancel")}
    </DialogClose>
  );

  if (!data) {
    return (
      <>
        <ConnectHeader connector={connector} title={title} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t("settings.connectWay.loadFailed")}
          </p>
        )}
        <DialogFooter className={FOOTER}>
          {cancel}
          {error && !isSwitching && (
            <Button type="button" size="lg" onClick={() => onChoose("ownSession")}>
              {t("settings.connectWay.useOwnSession")}
            </Button>
          )}
        </DialogFooter>
      </>
    );
  }
  if (!integrationUser || !signsIn) {
    return (
      <>
        <ConnectHeader connector={connector} title={title} />
        <NoIntegrationUserChoice
          signInStatus={integrationUser?.signInStatus}
          onOwnSession={isSwitching ? undefined : () => onChoose("ownSession")}
        />
        <DialogFooter className={FOOTER}>{cancel}</DialogFooter>
      </>
    );
  }
  // The address stands out in the sentence, so the owner copies the right one.
  const [beforeEmail, afterEmail] = t(
    isSwitching ? "settings.connectWay.inviteToSwitch" : "settings.connectWay.invite",
    { app },
  ).split("{email}");
  const invite = (
    <>
      {beforeEmail}
      <strong className="font-semibold text-foreground">{integrationUser.email}</strong>
      {afterEmail}
    </>
  );
  return (
    <>
      <ConnectHeader connector={connector} title={title} />
      <div role="radiogroup" aria-label={title} className="flex flex-col gap-3">
        <OptionCard
          name={`connect-way-${connector.id}`}
          value="integrationUser"
          selected={way}
          onSelect={setWay}
          title={<IntegrationUserTitle />}
          hint={invite}
        />
        {!isSwitching && (
          <OptionCard
            name={`connect-way-${connector.id}`}
            value="ownSession"
            selected={way}
            onSelect={setWay}
            title={t("settings.connectWay.ownSession")}
            hint={t("settings.connectWay.needsExtension")}
          />
        )}
      </div>
      <DialogFooter className={FOOTER}>
        {cancel}
        <Button type="button" size="lg" onClick={() => onChoose(way)}>
          {t(isSwitching ? "settings.connectWay.switch" : "apps.connect")}
        </Button>
      </DialogFooter>
    </>
  );
}

const FOOTER = "m-0 flex-row justify-end gap-2 border-0 bg-transparent p-0";
