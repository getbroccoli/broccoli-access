/** Google's consent address for a client, coming back to the instance's one callback. */
export function consentUrl(
  authorizationEndpoint: string,
  { clientId, redirectUri, scopes, state, nonce }: ConsentRequest,
  extraParameters: Record<string, string> = {},
): string {
  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    nonce,
    ...extraParameters,
  }).toString();
  return url.toString();
}

export interface ConsentRequest {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  nonce: string;
}
