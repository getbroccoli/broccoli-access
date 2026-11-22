import type { ApolloClient } from "@apollo/client";

import { type AppPageQuery, AppPageDocument } from "@/__generated__/graphql";

/** Loads an app's page into the cache before it opens; null for an unknown or malformed id. */
export async function loadAppPage(
  apolloClient: ApolloClient,
  appId: string,
): Promise<AppPageQuery["app"]> {
  const { data } = await apolloClient.query({ query: AppPageDocument, variables: { id: appId } });
  return data?.app ?? null;
}
