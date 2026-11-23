import { Copy } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";

type Props = {
  text: string;
  /** What screen readers hear the field hold and the button copy, such as "the extension's ID". */
  name: string;
};

/**
 * `text` in a read-only field that selects itself on focus, so it can be copied by hand, with a
 * Copy button that says, and announces, when it copied.
 */
export function CopyableText({ text, name }: Props) {
  const { copied, copiedAt, copyFailed, copy } = useCopyToClipboard();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          readOnly
          value={text}
          aria-label={name}
          onFocus={(event) => event.target.select()}
          className="h-7 w-auto max-w-full field-sizing-content bg-muted/40 px-1.5 font-mono text-[13px] text-foreground"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          // Fits "Copied" too, so the button never wraps away from the pointer after a copy.
          className="min-w-20"
          aria-label={t(copied ? "settings.extension.copiedName" : "settings.extension.copyName", {
            name,
          })}
          onClick={() => void copy(text)}
        >
          <Copy aria-hidden />
          {t(copied ? "settings.extension.copied" : "settings.extension.copy")}
        </Button>
        <span role="status" className="sr-only">
          {/* A new node per copy, so a second copy is announced too. */}
          {copied && <span key={copiedAt}>{t("settings.extension.copiedName", { name })}</span>}
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
