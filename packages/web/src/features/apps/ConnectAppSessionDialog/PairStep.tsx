import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { t } from "@/i18n";
import type { useChromeExtension } from "@/lib/useChromeExtension";

type Props = {
  extension: ReturnType<typeof useChromeExtension>;
};

/** Step 2: pair this Chrome's extension with the instance; the dialog moves on once it is paired. */
export function PairStep({ extension }: Props) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{t("settings.appSession.pairTitle")}</h3>
        <p className="text-sm text-foreground/80">
          {t("settings.appSession.pairBody", { host: window.location.host })}
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-semibold text-brand-foreground"
        >
          B
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold">{t("settings.extension.name")}</span>
          <span className="text-[13px] text-muted-foreground">
            {t("settings.appSession.installed", { browser: browserLabel() })}
          </span>
        </div>
      </div>
      {!extension.canPair && (
        <p className="text-sm text-muted-foreground">{t("settings.extension.needsHttps")}</p>
      )}
      {extension.isAwaitingPair && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("settings.extension.confirmInPopup")}
        </p>
      )}
      {(extension.isWindowBlocked || extension.startFailed) && (
        <p role="alert" className="text-sm text-destructive">
          {t(
            extension.isWindowBlocked
              ? "settings.extension.windowBlocked"
              : "settings.extension.pairFailed",
          )}
        </p>
      )}
      <DialogFooter className="m-0 flex-row justify-end gap-2 border-0 bg-transparent p-0">
        <DialogClose render={<Button type="button" variant="outline" size="lg" />}>
          {t("settings.apps.dialog.cancel")}
        </DialogClose>
        <Button
          type="button"
          size="lg"
          disabled={extension.isStarting || !extension.canPair}
          // A failure shows from the hook's state, so the rejection needs no handling here.
          onClick={() => void extension.startPairing().catch(() => undefined)}
        >
          {t("settings.extension.pair")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** This Chrome as the extension will report it once paired, such as "Chrome on macOS". */
function browserLabel(): string {
  const { userAgentData } = navigator as Navigator & { userAgentData?: { platform: string } };
  return userAgentData?.platform ? `Chrome on ${userAgentData.platform}` : "Chrome";
}
