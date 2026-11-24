import { ScanNowDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

type Props = {
  connectionId: string;
  /** Disables the button while a scan runs, so nothing more is queued. */
  isScanning: boolean;
  /** Replaces the room a page header leaves below it, such as in a card. */
  className?: string;
};

/** "Scan now" at the right of a page header, with its failure below it. */
export function ScanNowButton({ connectionId, isScanning, className }: Props) {
  const [scanNow, { loading, error }] = usePayloadMutation(ScanNowDocument);
  return (
    <div className={cn("flex flex-col items-end gap-2 pb-6", className)}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="px-4"
        disabled={isScanning || loading}
        // `usePayloadMutation` keeps a failure for display, so the rejection needs no handling here.
        onClick={() => void scanNow({ variables: { connectionId } }).catch(() => undefined)}
      >
        {t("scans.scanNow")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("scans.scanNowFailed")}
        </p>
      )}
    </div>
  );
}
