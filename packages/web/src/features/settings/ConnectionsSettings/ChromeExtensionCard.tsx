import { EXTENSION_ID } from "@broccoli-access/extension";

import { UnpairExtensionDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button, buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
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
          {extension.isAwaitingPair && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("settings.extension.confirmInPopup")}
            </p>
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
          {status === "not_installed" && (
            <a
              href={`https://chromewebstore.google.com/detail/${EXTENSION_ID}`}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-4")}
            >
              {t("settings.extension.webStore")}
            </a>
          )}
          {status === "not_paired" && (
            <Button
              type="button"
              size="lg"
              className="px-4"
              disabled={extension.isStarting}
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
              disabled={isUnpairing}
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
