import { EXTENSION_ID } from "@broccoli-access/extension";
import { DownloadSimple } from "@phosphor-icons/react";

import { buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { EXTENSION_DOWNLOAD_PATH } from "@/lib/extensionDownload";

import { CopyableText } from "./CopyableText";

/**
 * How to install the extension unpacked: download it from this instance, then the steps in Chrome,
 * and what to ask IT when a company-managed Chrome blocks Developer mode.
 */
export function InstallExtensionSteps() {
  return (
    <div className="flex flex-col gap-4">
      <a
        href={EXTENSION_DOWNLOAD_PATH}
        className={cn(buttonVariants({ size: "lg" }), "gap-2 self-start px-4")}
      >
        <DownloadSimple aria-hidden />
        {t("settings.extension.download")}
      </a>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground/80 marker:text-muted-foreground">
        <li>{t("settings.extension.stepUnzip")}</li>
        <li className="space-y-1.5">
          <p>{t("settings.extension.stepOpen")}</p>
          <CopyableText text={EXTENSIONS_PAGE} name={EXTENSIONS_PAGE} />
        </li>
        <li>{t("settings.extension.stepDeveloperMode")}</li>
        <li>{t("settings.extension.stepLoadUnpacked")}</li>
        <li>{t("settings.extension.stepComeBack")}</li>
      </ol>
      <div className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
        <p>{t("settings.extension.managedChrome")}</p>
        <CopyableText text={EXTENSION_ID} name={t("settings.extension.id")} />
      </div>
    </div>
  );
}

/** Chrome's extensions page, which a web page cannot link to. */
const EXTENSIONS_PAGE = "chrome://extensions";
