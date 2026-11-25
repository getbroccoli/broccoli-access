import type { DocumentNode } from "graphql";

import { ConnectWithIntegrationUserDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";

/** Connects or switches an app to the integration user; the dialog holds it, so it carries on while closed. */
export function useConnectWithIntegrationUser(refetch?: DocumentNode[]) {
  return usePayloadMutation(ConnectWithIntegrationUserDocument, { refetch });
}
