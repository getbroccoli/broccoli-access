import { CircleNotch } from "@phosphor-icons/react";

import { InstallExtensionSteps } from "@/components/InstallExtensionSteps";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { t } from "@/i18n";

type Props = {
  app: string;
};

/** Step 1: install the extension; the dialog moves on once this Chrome has it. */
export function ExtensionStep({ app }: Props) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{t("settings.appSession.extensionTitle")}</h3>
        <p className="text-sm text-foreground/80">
          {t("settings.appSession.extensionBody", { app })}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {t("settings.appSession.sendsOnly", { app })}
        </p>
      </div>
      <InstallExtensionSteps />
      <p
        aria-live="polite"
        className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3.5 py-3 text-sm text-foreground/80"
      >
        <CircleNotch size={18} className="shrink-0 animate-spin" aria-hidden />
        {t("settings.appSession.waitingForExtension")}
      </p>
      <DialogFooter className="m-0 flex-row items-center justify-between gap-2 border-0 bg-transparent p-0">
        <span className="text-[13px] text-muted-foreground">
          {t("settings.appSession.chromeOnly")}
        </span>
        <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
          {t("settings.apps.dialog.cancel")}
        </DialogClose>
      </DialogFooter>
    </>
  );
}
