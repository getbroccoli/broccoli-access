import type { ApolloCache } from "@apollo/client";
import {
  AccountsWithoutPersonDocument,
  PersonPageDocument,
  type AccountsWithoutPersonQuery,
  type PersonPageQuery,
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
