import type { ApolloCache } from "@apollo/client";

/**
 * Drops every cached app list, the counts and the apps to connect, which the server computes, so
 * they load afresh.
 */
export function forgetAppLists(cache: ApolloCache): void {
  cache.evict({ id: "ROOT_QUERY", fieldName: "apps" });
  cache.evict({ id: "ROOT_QUERY", fieldName: "appCounts" });
  cache.evict({ id: "ROOT_QUERY", fieldName: "appsToConnect" });
  cache.gc();
}
