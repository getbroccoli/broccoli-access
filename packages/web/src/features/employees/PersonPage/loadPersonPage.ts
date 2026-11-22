import type { ApolloClient } from "@apollo/client";

import { type PersonPageQuery, PersonPageDocument } from "@/__generated__/graphql";

/** Loads a person's page afresh into the cache before it opens; null for an unknown or malformed id. */
export async function loadPersonPage(
  apolloClient: ApolloClient,
  employeeId: string,
): Promise<PersonPageQuery["employee"]> {
  const { data } = await apolloClient.query({
    query: PersonPageDocument,
    variables: { id: employeeId },
    // A scan changes a person's accounts outside the cache, so each visit reads them afresh.
    fetchPolicy: "network-only",
  });
  return data?.employee ?? null;
}
