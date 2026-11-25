import type { AccountChangeActor_ConnectionFragment } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { connectingFieldName } from "../connectingFieldName";

type ActorApp = {
  name: string;
  containerConnection: {
    sessionFrom: AccountChangeActor_ConnectionFragment["sessionFrom"];
    connector: {
      connectionFields: AccountChangeActor_ConnectionFragment["connector"]["connectionFields"];
    };
  } | null;
};

/** How Broccoli Access acts when it changes an account through a connector. */
export function accountChangeActor({ name, containerConnection }: ActorApp): string | null {
  if (!containerConnection) return null;
  const { sessionFrom, connector } = containerConnection;
  if (sessionFrom === "SERVER_SIGN_IN") return t("apps.change.actor.integrationUser");
  if (
    sessionFrom === "EXTENSION" ||
    connector.connectionFields.some(({ kind }) => kind === "APP_SESSION")
  ) {
    return t("apps.change.actor.ownerSession", { app: name });
  }
  return t("apps.change.actor.credential", {
    field: connectingFieldName(connector.connectionFields),
  });
}
