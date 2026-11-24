import type { ApolloClient } from "@apollo/client";

import { type TemplatePageQuery, TemplatePageDocument } from "@/__generated__/graphql";

/** Loads a template's page afresh into the cache before it opens; null for an unknown or malformed id. */
export async function loadTemplatePage(
  apolloClient: ApolloClient,
  templateId: string,
): Promise<TemplatePageQuery["template"]> {
  const { data } = await apolloClient.query({
    query: TemplatePageDocument,
    variables: { id: templateId },
    // Approving or ignoring an app changes what "Add app" offers, so each visit reads afresh.
    fetchPolicy: "network-only",
  });
  return data?.template ?? null;
}
