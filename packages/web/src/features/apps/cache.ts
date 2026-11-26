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

/** Drops Activity's list, so a change only the server places in it loads afresh. */
export function forgetAccountChanges(cache: ApolloCache): void {
  cache.evict({ id: "ROOT_QUERY", fieldName: "accountChanges" });
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
 * Drops a person's apps, invite rows and provision steps after a refused Invite or Provision, which
 * what the page offered no longer matches, so their page loads them afresh.
 */
export function forgetPersonApps(cache: ApolloCache, employeeId: string): void {
  const id = cache.identify({ __typename: "Employee", id: employeeId });
  cache.evict({ id, fieldName: "personApps" });
  cache.evict({ id, fieldName: "appInvites" });
  cache.evict({ id, fieldName: "provisionSteps" });
}

/**
 * The open queries a reconnect changes beyond its payload, read again once it succeeds: a person's
 * invite rows, which offer Invite again instead of Reconnect.
 */
export const REFETCH_AFTER_RECONNECT = [PersonPageDocument];
