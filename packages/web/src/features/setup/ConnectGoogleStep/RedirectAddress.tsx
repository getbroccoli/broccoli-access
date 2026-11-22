import { Copy } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";

type Props = {
  address: string;
};

/** The address the admin registers for their Google app, with a button that copies it. */
export function RedirectAddress({ address }: Props) {
  const { copied, copyFailed, copy } = useCopyToClipboard();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="google-redirect-address">{t("setup.connect.redirectAddress")}</Label>
      <div className="flex gap-2">
        <Input
          id="google-redirect-address"
          readOnly
          value={address}
          onFocus={(event) => event.target.select()}
          className="h-11 flex-1 rounded-lg bg-muted/40 px-4"
          aria-describedby={copyFailed ? "google-redirect-address-error" : undefined}
        />
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-2 px-4"
          onClick={() => void copy(address)}
        >
          <Copy aria-hidden />
          {copied ? t("setup.connect.copied") : t("setup.connect.copy")}
        </Button>
      </div>
      {copyFailed && (
        <p id="google-redirect-address-error" role="alert" className="text-sm text-destructive">
          {t("setup.connect.copyFailed")}
        </p>
      )}
    </div>
  );
}
