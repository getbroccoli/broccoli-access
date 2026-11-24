import type { ApolloClient } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  AccountsWithoutPersonDocument,
  type AccountsWithoutPersonQuery,
} from "@/__generated__/graphql";
import { useCache } from "@/apollo";
import { readAccountWindow, storeAccountWindow } from "../cache";
import { t } from "@/i18n";

type Page = AccountsWithoutPersonQuery["accountsWithoutPerson"];

/** Append by cursor, and refresh the whole open window after a scan or a stale link. */
export function useAccountsWithoutPerson(showAccounts: boolean) {
  const cache = useCache();
  const query = useQuery(AccountsWithoutPersonDocument, {
    skip: !showAccounts,
    fetchPolicy: "cache-and-network",
  });
  const pending = useRef(Promise.resolve());
  const [busy, setBusy] = useState(false);

  function read(more: boolean) {
    setBusy(true);
    const next = pending.current
      .then(async () => {
        const previous = readAccountWindow(cache);
        const page = await nextWindow(query.client, previous, more);
        if (page) storeAccountWindow(cache, page, previous);
      })
      .catch(() =>
        toast.error(t(more ? "people.accounts.moreFailed" : "people.accounts.loadFailed")),
      );
    const done = next.then(() => {
      if (pending.current === done) setBusy(false);
    });
    pending.current = done;
    return done;
  }
  return {
    ...query,
    loading: busy || query.loading,
    refresh: () => read(false),
    loadMore: () => read(true),
  };
}

const PAGE_SIZE = 100;

async function nextWindow(client: ApolloClient, previous: Page | undefined, more: boolean) {
  if (more && !previous?.pageInfo.hasNextPage) return;
  const size = more ? PAGE_SIZE : Math.max(PAGE_SIZE, previous?.edges.length ?? 0);
  let after = more ? previous?.pageInfo.endCursor : null;
  let edges: Page["edges"] = more ? [...previous!.edges] : [];
  let remaining = size;
  while (remaining > 0) {
    const { data } = await client.query({
      query: AccountsWithoutPersonDocument,
      variables: { first: Math.min(remaining, 10_000), after },
      fetchPolicy: "no-cache",
    });
    if (!data) throw new Error("No account page was returned.");
    const page = data.accountsWithoutPerson;
    edges = edges.concat(page.edges);
    remaining -= page.edges.length;
    after = page.pageInfo.endCursor;
    if (!page.pageInfo.hasNextPage || remaining === 0) {
      return { ...page, edges };
    }
  }
}
