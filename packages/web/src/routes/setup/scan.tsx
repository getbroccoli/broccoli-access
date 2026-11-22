import { createFileRoute } from "@tanstack/react-router";

import { requireSetupPage, ScanStep } from "@/features/setup";

/** Setup's second step: the owner, signed in by Google's consent, waits for the scan. */
export const Route = createFileRoute("/setup/scan")({
  beforeLoad: (gate) => {
    requireSetupPage("scan", gate);
  },
  component: ScanStep,
});
