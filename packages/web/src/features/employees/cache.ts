import type { ApolloCache } from "@apollo/client";
import {
  AccountsWithoutPersonDocument,
  type AccountsWithoutPersonQuery,
} from "@/__generated__/graphql";
import { evictRecord } from "@/apollo";

/** A linked account leaves every cached page of accounts without a person. */
export function removeLinkedAccount(cache: ApolloCache, id: string): void {
  cache.modify({
    fields: { accountsWithoutPersonCount: (count: number) => Math.max(0, count - 1) },
  });
  evictRecord(cache, "AccountWithoutPerson", id);
}

type AccountWindow = AccountsWithoutPersonQuery["accountsWithoutPerson"];

export function readAccountWindow(cache: ApolloCache): AccountWindow | undefined {
  return cache.readQuery({ query: AccountsWithoutPersonDocument })?.accountsWithoutPerson;
}

/** Keep links made while a window was loading out of the refreshed list. */
export function storeAccountWindow(
  cache: ApolloCache,
  page: AccountWindow,
  previous?: AccountWindow,
) {
  const live = new Set(readAccountWindow(cache)?.edges.map(({ node }) => node.id));
  const removed = new Set(
    previous?.edges.filter(({ node }) => !live.has(node.id)).map(({ node }) => node.id),
  );
  const edges = page.edges.filter(({ node }) => !removed.has(node.id));
  cache.writeQuery({
    query: AccountsWithoutPersonDocument,
    data: { accountsWithoutPerson: { ...page, edges } },
  });
}
