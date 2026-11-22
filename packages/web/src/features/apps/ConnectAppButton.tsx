import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { Link } from "@tanstack/react-router";

import {
  type ConnectAppButton_ConnectorFragment,
  ConnectAppButton_ConnectorFragmentDoc,
} from "@/__generated__/graphql";
import { Button, buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { ConnectContainerConnectorDialog } from "./ConnectContainerConnectorDialog";
import { connectsWithText } from "./connectsWithText";

type Props = {
  connector: FragmentType<ConnectAppButton_ConnectorFragment>;
  /** `default` in a table row, reading "Connect"; `lg` reads "Connect <app>". */
  size: "default" | "lg";
  /** Runs once the app is connected. */
  onConnected?: () => void;
};

/** Connect for an app a connector can manage: its connect dialog, or Settings for an app session. */
export function ConnectAppButton({ connector, size, onConnected }: Props) {
  const { data, complete } = useFragment({
    fragment: ConnectAppButton_ConnectorFragmentDoc,
    // Its document holds the dialog's fragment too.
    fragmentName: "ConnectAppButton_connector",
    from: connector,
  });
  if (!complete) {
    return null;
  }
  const name = t("settings.apps.connect", { app: data.name });
  const label = size === "lg" ? name : t("apps.connect");
  const className = size === "lg" ? "px-4" : "px-3 text-[13px] font-semibold";
  if (!connectsWithText(data)) {
    // shortcut: an app session connects in Settings > Connections; open its own dialog here once
    // the extension hands the session over from this page.
    return (
      <Link
        to="/settings/connections"
        aria-label={name}
        className={cn(buttonVariants({ size }), className)}
      >
        {label}
      </Link>
    );
  }
  return (
    <ConnectContainerConnectorDialog
      connector={data}
      onConnected={onConnected}
      trigger={
        <Button type="button" size={size} aria-label={name} className={className}>
          {label}
        </Button>
      }
    />
  );
}
