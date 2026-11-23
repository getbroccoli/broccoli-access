import { Copy } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";

type Props = {
  text: string;
  /** What screen readers hear the button copy, such as "the extension's ID". */
  name: string;
};

/** `text` in code style with a Copy button that says, and announces, when it copied. */
export function CopyableText({ text, name }: Props) {
  const { copied, copyFailed, copy } = useCopyToClipboard();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] break-all text-foreground select-all">
          {text}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy(text)}>
          <Copy aria-hidden />
          {copied ? t("settings.extension.copied") : t("settings.extension.copy")}
          <span className="sr-only"> {name}</span>
        </Button>
        <span role="status" className="sr-only">
          {copied ? t("settings.extension.copiedAnnouncement", { name }) : ""}
        </span>
      </div>
      {copyFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t("settings.extension.copyFailed")}
        </p>
      )}
    </div>
  );
}
