import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { t } from "@/i18n";

import { type AppSessionConnector, ConnectAppSessionSteps } from "./ConnectAppSessionSteps";

type Props = {
  connector: AppSessionConnector;
};

/** Connect <app> for an app connected with the owner's app session, which the extension hands over. */
export function ConnectAppSessionDialog({ connector }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="lg" className="px-4" />}>
        {t("settings.apps.connect", { app: connector.name })}
      </DialogTrigger>
      <DialogContent className="gap-5 p-6 sm:max-w-lg">
        {/* Mounted while open, so each opening starts again from the first step not done. */}
        {open && (
          <ConnectAppSessionSteps connector={connector} onConnected={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
