import { createFileRoute } from "@tanstack/react-router";

import { ContainerConnectorsSettings } from "@/features/settings";

export const Route = createFileRoute("/_authenticated/settings/apps")({
  component: ContainerConnectorsSettings,
});
