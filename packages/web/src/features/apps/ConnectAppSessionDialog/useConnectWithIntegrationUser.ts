import { ConnectWithIntegrationUserDocument } from "@/__generated__/graphql";
import { useCache, usePayloadMutation } from "@/apollo";

import { forgetAppLists } from "../cache";

/** Connects or switches an app to the integration user; the dialog holds it, so it carries on while closed. */
export function useConnectWithIntegrationUser() {
  const cache = useCache();
  return usePayloadMutation(
    ConnectWithIntegrationUserDocument,
    // Connecting approves the app, which moves the app lists and their counts.
    {
      update: (_cache, { data }) => {
        if (data?.connectors.connectWithIntegrationUser.containerConnector) {
          forgetAppLists(cache);
        }
      },
    },
  );
}
