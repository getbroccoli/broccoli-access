import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsSettings } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/connections/")({
  component: ConnectionsSettings,
});
