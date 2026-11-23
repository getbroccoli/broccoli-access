import { ConnectContainerConnectorDocument } from "@/__generated__/graphql";
import { useCache, usePayloadMutation } from "@/apollo";

import { forgetAppLists } from "../cache";

/** Connects an app with its handed-over session; the dialog holds it, so it stays open while connecting. */
export function useConnectAppSession() {
  const cache = useCache();
  return usePayloadMutation(
    ConnectContainerConnectorDocument,
    // Connecting approves the app, which moves the app lists and their counts.
    {
      update: (_cache, { data }) => {
        if (data?.connectors.connect.containerConnector) {
          forgetAppLists(cache);
        }
      },
    },
  );
}
