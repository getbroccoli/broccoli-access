import { UnpairExtensionDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { InstallExtensionSteps } from "@/components/InstallExtensionSteps";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { EXTENSION_DOWNLOAD_PATH } from "@/lib/extensionDownload";
import { formatSince } from "@/lib/since";
import { useChromeExtension } from "@/lib/useChromeExtension";

/** The Chrome extension: install it, pair this Chrome with the instance, or unpair it. */
export function ChromeExtensionCard() {
  const extension = useChromeExtension();
  const [unpair, { loading: isUnpairing, error: unpairError }] =
    usePayloadMutation(UnpairExtensionDocument);
  const { status, pairing } = extension;

  return (
    <section aria-labelledby="chrome-extension-title" className="flex flex-col gap-2.5 pt-6">
      <h2 id="chrome-extension-title" className="text-sm font-semibold text-muted-foreground">
        {t("settings.extension.section")}
      </h2>
      <article className="flex flex-col gap-4 rounded-xl border border-border p-6 sm:flex-row sm:items-start">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand text-lg font-semibold text-brand-foreground"
        >
          B
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{t("settings.extension.name")}</h3>
            {status !== "checking" && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  status === "paired"
                    ? "bg-brand-soft text-brand-deep"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {t(BADGES[status])}
              </span>
            )}
          </div>
          {pairing ? (
            <>
              <p className="text-sm text-foreground/80">
                {t("settings.extension.pairedSummary", {
                  browser: pairing.browser,
                  day: formatSince({ at: pairing.pairedAt, before: false }),
                })}
              </p>
              <p className="text-[13px] text-muted-foreground">
                {t("settings.extension.pairedNote")}
              </p>
            </>
          ) : (
            <p className="text-sm text-foreground/80">{t("settings.extension.description")}</p>
          )}
          {status === "not_installed" && (
            <div className="pt-3">
              <InstallExtensionSteps />
            </div>
          )}
          {extension.isInstalled && extension.canPair && (
            <div className="flex flex-col items-start gap-1 pt-2">
              <p className="text-[13px] text-muted-foreground">
                {t("settings.extension.updateNote")}
              </p>
              <a
                href={EXTENSION_DOWNLOAD_PATH}
                className="text-sm font-medium underline underline-offset-4"
              >
                {t("settings.extension.download")}
              </a>
            </div>
          )}
          {status === "not_paired" && !extension.canPair && (
            <p className="text-sm text-muted-foreground">{t("settings.extension.needsHttps")}</p>
          )}
          {extension.isAwaitingPair && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("settings.extension.confirmInPopup")}
            </p>
          )}
          {extension.isWindowBlocked && (
            <p role="alert" className="text-sm text-destructive">
              {t("settings.extension.windowBlocked")}
            </p>
          )}
          {extension.loadFailed && (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-sm text-destructive">{t("settings.extension.loadFailed")}</p>
              <Button type="button" variant="outline" onClick={extension.retry}>
                {t("settings.connections.retry")}
              </Button>
            </div>
          )}
          {(extension.startFailed || unpairError) && (
            <p role="alert" className="text-sm text-destructive">
              {t(
                extension.startFailed
                  ? "settings.extension.pairFailed"
                  : "settings.extension.unpairFailed",
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status === "not_paired" && (
            <Button
              type="button"
              size="lg"
              className="px-4"
              disabled={extension.isStarting || !extension.canPair}
              // A failure shows from the hook's state, so the rejection needs no handling here.
              onClick={() => void extension.startPairing().catch(() => undefined)}
            >
              {t("settings.extension.pair")}
            </Button>
          )}
          {status === "paired" && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="px-4"
              disabled={isUnpairing || extension.isReading}
              onClick={() => void unpair().catch(() => undefined)}
            >
              {t("settings.extension.unpair")}
            </Button>
          )}
        </div>
      </article>
    </section>
  );
}

/** The badge beside the name for each status but `checking`, which shows none. */
const BADGES = {
  not_installed: "settings.extension.notInstalled",
  not_paired: "settings.extension.notPaired",
  paired: "settings.extension.paired",
} as const;
