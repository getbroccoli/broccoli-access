/** Google's token response names identity scopes by their full names. */
export function shortScopeName(scope: string): string {
  return SHORT_SCOPE_NAMES[scope] ?? scope;
}
const SHORT_SCOPE_NAMES: Partial<Record<string, string>> = {
  "https://www.googleapis.com/auth/userinfo.email": "email",
  "https://www.googleapis.com/auth/userinfo.profile": "profile",
};
