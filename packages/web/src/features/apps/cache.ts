import type { ApolloCache } from "@apollo/client";

import { PersonPageDocument } from "@/__generated__/graphql";

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

/**
 * Drops what a Disable or Enable changes on other pages, which the server computes: the app lists'
 * "still have access" and the People badge, so they load afresh.
 */
export function forgetAccessCounts(cache: ApolloCache): void {
  cache.evict({ id: "ROOT_QUERY", fieldName: "apps" });
  cache.evict({ id: "ROOT_QUERY", fieldName: "employeeCounts" });
  cache.gc();
}

/**
 * The open queries a reconnect changes beyond its payload, read again once it succeeds: a person's
 * invite rows, which offer Invite again instead of Reconnect.
 */
export const REFETCH_AFTER_RECONNECT = [PersonPageDocument];
