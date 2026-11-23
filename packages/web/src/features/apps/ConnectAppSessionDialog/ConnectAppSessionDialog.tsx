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
import { useConnectAppSession } from "./useConnectAppSession";

type Props = {
  connector: FragmentType<ConnectAppSessionDialog_ConnectorFragment>;
  /** The button that opens it; "Connect <app>" by default. */
  trigger?: ReactElement;
  /** Runs once the app is connected, for a page showing what only the server computes. */
  onConnected?: () => void;
};

/** Connect <app> for an app connected with the owner's app session, which the extension hands over. */
export function ConnectAppSessionDialog({ connector: from, trigger, onConnected }: Props) {
  const { data: connector, complete } = useFragment({
    fragment: ConnectAppSessionDialog_ConnectorFragmentDoc,
    from,
  });
  const [open, setOpen] = useState(false);
  const connection = useConnectAppSession();
  const [, { loading, reset }] = connection;
  if (!complete) {
    return null;
  }
  const changeOpen = (next: boolean) => {
    // Closed only once Connect ends, so its result always has a place to show.
    if (loading) {
      return;
    }
    setOpen(next);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button type="button" size="lg" className="px-4">
              {t("settings.apps.connect", { app: connector.name })}
            </Button>
          )
        }
      />
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        {/* Mounted while open, so each opening starts again from the first step not done. */}
        {open && (
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
