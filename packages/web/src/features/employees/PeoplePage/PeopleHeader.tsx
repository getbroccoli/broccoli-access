import type { DirectoryScanQuery } from "@/__generated__/graphql";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { t } from "@/i18n";
import { formatLastScan } from "@/lib/lastScan";
import { PageHeader } from "@/shell";
import { ScanNowButton } from "@/components/ScanNowButton";
import { Button } from "@/components/ui/button";
import { AddPersonDialog } from "./AddPersonDialog";

type Props = {
  /** The Google Workspace connection; null without one, undefined while it loads. */
  connection: DirectoryScanQuery["setup"]["googleWorkspace"] | undefined;
  /** Whether the page has its data, so the description waits for the last scan. */
  loaded: boolean;
  canAddPerson: boolean;
};

/** The page's title with when Google Workspace was last scanned, and "Scan now". */
export function PeopleHeader({ connection, loaded, canAddPerson }: Props) {
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate({ from: "/people" });
  const scan = connection?.scan;
  const isScanning = scan?.status === "SCANNING";
  // The header shows the last scan without its full stop, as one line with the description.
  const lastScan = isScanning
    ? t("scans.scanning")
    : formatLastScan(scan?.readAt ?? null).replace(/\.$/, "");

  return (
    <div className="flex items-start justify-between gap-4">
      <PageHeader
        title={t("people.title")}
        description={loaded ? `${t("people.description")} ${lastScan}` : undefined}
      />
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        {connection && <ScanNowButton connectionId={connection.id} isScanning={isScanning} />}
        {canAddPerson && connection && (
          <Button type="button" onClick={() => setAdding(true)}>
            {t("people.add.title")}
          </Button>
        )}
      </div>
      {adding && (
        <AddPersonDialog
          onClose={() => setAdding(false)}
          onAdded={(employeeId) =>
            void navigate({ to: "/people/$employeeId", params: { employeeId } })
          }
        />
      )}
    </div>
  );
}
