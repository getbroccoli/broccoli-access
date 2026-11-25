import type { AppSessionSource } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { connectingFieldName } from "../connectingFieldName";

type ActorApp = {
  name: string;
  containerConnection: {
    sessionFrom: AppSessionSource | null;
    connector: {
      connectionFields: readonly { label: string; secret: boolean }[];
    };
  } | null;
};

/** How Broccoli Access acts when it changes an account through a connector. */
export function accountChangeActor({ name, containerConnection }: ActorApp): string | null {
  if (!containerConnection) return null;
  const { sessionFrom, connector } = containerConnection;
  if (sessionFrom === "SERVER_SIGN_IN") return t("apps.change.actor.integrationUser");
  if (sessionFrom === "EXTENSION") {
    return t("apps.change.actor.ownerSession", { app: name });
  }
  const field = connectingFieldName(connector.connectionFields);
  return field ? t("apps.change.actor.credential", { field }) : null;
}
