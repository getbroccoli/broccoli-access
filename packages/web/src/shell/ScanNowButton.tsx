import { ScanNowDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type Props = {
  connectionId: string;
  /** Disables the button while a scan runs, so nothing more is queued. */
  isScanning: boolean;
};

/** "Scan now" at the right of a page header, with its failure below it. */
export function ScanNowButton({ connectionId, isScanning }: Props) {
  const [scanNow, { loading, error }] = usePayloadMutation(ScanNowDocument);
  return (
    <div className="flex flex-col items-end gap-2 pb-6">
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
