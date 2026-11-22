import type { ApolloCache } from "@apollo/client";

/** Drops every cached app list and the counts, which the server computes, so they load afresh. */
export function forgetAppLists(cache: ApolloCache): void {
  cache.evict({ id: "ROOT_QUERY", fieldName: "apps" });
  cache.evict({ id: "ROOT_QUERY", fieldName: "appCounts" });
  cache.gc();
}
