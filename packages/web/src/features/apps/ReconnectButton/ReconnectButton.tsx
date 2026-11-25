import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  type ReconnectButton_ConnectorFragment,
  ReconnectButton_ConnectorFragmentDoc,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { ConnectContainerConnectorDialog } from "../ConnectContainerConnectorDialog";
import { connectsWithText } from "../connectsWithText";
import { ReconnectAppSessionButton } from "./ReconnectAppSessionButton";
import { ReconnectIntegrationUserButton } from "./ReconnectIntegrationUserButton";

type Props = {
  /** The connected connector whose connection needs reconnecting. */
  connector: FragmentType<ReconnectButton_ConnectorFragment>;
  /** The button's words; "Reconnect" by default. */
  label?: string;
  /** `sm` for an account row. */
  size?: "sm" | "lg";
  variant?: "default" | "outline";
};

/**
 * Reconnects a connection: a typed key opens the dialog for a new key; an app session opens the
 * extension's hand-over window, then reconnects with the session it hands over.
 */
export function ReconnectButton({
  connector: from,
  label = t("apps.reconnect.button"),
  size = "lg",
  variant = "default",
}: Props) {
  const { data: connector, complete } = useFragment({
    fragment: ReconnectButton_ConnectorFragmentDoc,
    // The document also holds the key dialog's fragment, which this one spreads.
    fragmentName: "ReconnectButton_connector",
    from,
  });
  if (!complete) {
    return null;
  }
  const button = { label, size, variant };
  if (connectsWithText(connector)) {
    return (
      <ConnectContainerConnectorDialog
        connector={connector}
        trigger={
          <Button type="button" size={size} variant={variant} className={PADDING[size]}>
            {label}
          </Button>
        }
      />
    );
  }
  // Signed in as the integration user, it signs in as it again: never silently as the owner.
  if (connector.connection?.sessionFrom === "SERVER_SIGN_IN") {
    return <ReconnectIntegrationUserButton connector={connector} button={button} />;
  }
  return <ReconnectAppSessionButton connector={connector} button={button} />;
}

const PADDING = { sm: "px-3", lg: "px-4" } as const;
