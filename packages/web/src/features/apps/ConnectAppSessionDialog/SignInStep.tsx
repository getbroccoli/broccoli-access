import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { t } from "@/i18n";
import type { useChromeExtension } from "@/lib/useChromeExtension";

import type { AppSessionConnector } from "./ConnectAppSessionSteps";
import type { useAppSessionHandOver } from "./useAppSessionHandOver";

type Props = {
  connector: Pick<AppSessionConnector, "name" | "appDomain">;
  handOver: ReturnType<typeof useAppSessionHandOver>;
  extension: ReturnType<typeof useChromeExtension>;
};

/** Step 4: sign in to the app in this Chrome, then Connect hands the session over in the extension. */
export function SignInStep({ connector, handOver, extension }: Props) {
  const app = connector.name;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{t("settings.appSession.signInTitle", { app })}</h3>
        <p className="text-sm text-foreground/80">{t("settings.appSession.signInBody", { app })}</p>
      </div>
      <ul className="flex list-disc flex-col gap-1.5 rounded-lg bg-muted/50 py-3 pr-3.5 pl-8 text-[13px] text-foreground/80">
        <li>{t("settings.appSession.sendsNothingElse", { app })}</li>
        <li>{t("settings.appSession.storedEncrypted")}</li>
      </ul>
      {handOver.isAwaiting && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("settings.appSession.confirmInWindow")}
        </p>
      )}
      {(handOver.isWindowBlocked || handOver.wasAbandoned || handOver.readFailed) && (
        <p role="alert" className="text-sm text-destructive">
          {handOver.isWindowBlocked && t("settings.appSession.windowBlocked")}
          {handOver.wasAbandoned && t("settings.appSession.notHandedOver", { app })}
          {handOver.readFailed && t("settings.appSession.readFailed", { app })}
        </p>
      )}
      {/* The extension's window says when this Chrome is not paired, which the page cannot see. */}
      {handOver.wasAbandoned && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          {t("settings.appSession.pairAgainHint")}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            disabled={extension.isStarting || !extension.canPair}
            onClick={() => void extension.startPairing().catch(() => undefined)}
          >
            {t("settings.extension.pair")}
          </Button>
        </p>
      )}
      <DialogFooter className="m-0 flex-col-reverse gap-3 border-0 bg-transparent p-0 sm:flex-row sm:items-center sm:justify-between">
        <a
          href={`https://${connector.appDomain}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-brand-deep underline underline-offset-4"
        >
          {t("settings.appSession.openApp", { app })}
        </a>
        <div className="flex justify-end gap-2">
          <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
            {t("settings.apps.dialog.cancel")}
          </DialogClose>
          <Button type="button" size="lg" disabled={handOver.isAwaiting} onClick={handOver.start}>
            {t("settings.apps.connect", { app })}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
