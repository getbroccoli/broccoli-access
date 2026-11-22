import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { t } from "@/i18n";

import { type AppSessionConnector, ConnectAppSessionSteps } from "./ConnectAppSessionSteps";
import { useConnectAppSession } from "./useConnectAppSession";

type Props = {
  connector: AppSessionConnector;
};

/** Connect <app> for an app connected with the owner's app session, which the extension hands over. */
export function ConnectAppSessionDialog({ connector }: Props) {
  const [open, setOpen] = useState(false);
  const connection = useConnectAppSession();
  const [, { loading, reset }] = connection;
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
      <DialogTrigger render={<Button type="button" size="lg" className="px-4" />}>
        {t("settings.apps.connect", { app: connector.name })}
      </DialogTrigger>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        {/* Mounted while open, so each opening starts again from the first step not done. */}
        {open && (
          <ConnectAppSessionSteps
            connector={connector}
            connection={connection}
            onConnected={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
