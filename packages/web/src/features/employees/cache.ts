import type { ApolloCache } from "@apollo/client";
import {
  AccountsWithoutPersonDocument,
  PersonPageDocument,
  MarkedAccountsDocument,
  type MarkedAccountsQuery,
  type AccountsWithoutPersonQuery,
  type PersonPageQuery,
} from "@/__generated__/graphql";
import { evictRecord } from "@/apollo";

/** A linked or marked account leaves every cached page of accounts without a person. */
export function removeAccountWithoutPerson(cache: ApolloCache, id: string): void {
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

/** Apply the confirmed choice without discarding pages loaded with Show more. */
export function storePickedRole(
  cache: ApolloCache,
  employeeId: string,
  pickedFrom: NonNullable<PersonPageQuery["employee"]>["personApps"]["edges"][number]["node"],
  role: string | null,
) {
  cache.updateQuery({ query: PersonPageDocument, variables: { id: employeeId } }, (previous) => {
    if (!previous?.employee) return previous;
    const { employee } = previous;
    return {
      ...previous,
      employee: {
        ...employee,
        personApps: {
          ...employee.personApps,
          edges: employee.personApps.edges.map((edge) =>
            edge.node.app.id === pickedFrom.app.id &&
            edge.node.roleConflict &&
            edge.node.roleSources.length === pickedFrom.roleSources.length &&
            edge.node.roleSources.every(
              (source, i) =>
                source.role === pickedFrom.roleSources[i]?.role &&
                source.template.id === pickedFrom.roleSources[i]?.template.id,
            )
              ? {
                  ...edge,
                  node: { ...edge.node, role, roleConflict: false, roleSources: [] },
                }
              : edge,
          ),
        },
      },
    };
  });
}

export function readMarkedWindow(cache: ApolloCache) {
  return cache.readQuery({ query: MarkedAccountsDocument })?.markedAccounts;
}

export function storeMarkedWindow(
  cache: ApolloCache,
  markedAccounts: MarkedAccountsQuery["markedAccounts"],
  previous?: MarkedAccountsQuery["markedAccounts"],
) {
  const before = new Map(previous?.edges.map(({ node }) => [node.id, node.note]));
  // An edit committed while a scan refresh was reading keeps its newer note.
  const edited = new Map(
    readMarkedWindow(cache)
      ?.edges.filter(({ node }) => before.has(node.id) && before.get(node.id) !== node.note)
      .map(({ node }) => [node.id, node]),
  );
  const edges = markedAccounts.edges.map((edge) => {
    const live = edited.get(edge.node.id);
    return live ? { ...edge, node: { ...edge.node, note: live.note } } : edge;
  });
  cache.writeQuery({
    query: MarkedAccountsDocument,
    data: { markedAccounts: { ...markedAccounts, edges } },
  });
}
