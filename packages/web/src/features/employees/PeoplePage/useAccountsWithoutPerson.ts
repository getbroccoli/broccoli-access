import { useQuery } from "@apollo/client/react";
import { AccountsWithoutPersonDocument, MarkedAccountsDocument } from "@/__generated__/graphql";
import { useCache } from "@/apollo";
import {
  readAccountWindow,
  readMarkedWindow,
  storeAccountWindow,
  storeMarkedWindow,
} from "../cache";
import { useAccountWindow } from "./useAccountWindow";

/** The two independently paged lists on Accounts without a person. */
export function useAccountsWithoutPerson(showAccounts: boolean) {
  const cache = useCache();
  const options = { skip: !showAccounts, fetchPolicy: "cache-and-network" } as const;
  const waiting = useQuery(AccountsWithoutPersonDocument, options);
  const marked = useQuery(MarkedAccountsDocument, options);
  const waitingWindow = useAccountWindow({
    loading: waiting.loading,
    current: () => readAccountWindow(cache),
    store: (page, previous) => storeAccountWindow(cache, page, previous),
    fetchPage: async (first, after) =>
      (
        await waiting.client.query({
          query: AccountsWithoutPersonDocument,
          variables: { first, after },
          fetchPolicy: "no-cache",
        })
      ).data?.accountsWithoutPerson,
  });
  const markedWindow = useAccountWindow({
    loading: marked.loading,
    current: () => readMarkedWindow(cache),
    store: (page, previous) => storeMarkedWindow(cache, page, previous),
    fetchPage: async (first, after) =>
      (
        await marked.client.query({
          query: MarkedAccountsDocument,
          variables: { first, after },
          fetchPolicy: "no-cache",
        })
      ).data?.markedAccounts,
  });
  return { accounts: { ...waiting, ...waitingWindow }, marked: { ...marked, ...markedWindow } };
}
