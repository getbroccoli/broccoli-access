import type { SeedPerson } from "../seed";
import { fullName } from "./state";

/** What the consent page shows and sends back with the person's decision. */
export interface ConsentPage {
  appName: string;
  scopes: string[];
  accounts: SeedPerson[];
  /** The authorization request's parameters, sent back unchanged with the decision. */
  parameters: Record<string, string>;
}

/**
 * Google's consent step: the app, the permissions it asks for, the accounts to choose from,
 * and Allow and Cancel buttons whose labels browsers driven by agents can rely on.
 */
export function consentPageHtml({ appName, scopes, accounts, parameters }: ConsentPage): string {
  const hiddenFields = Object.entries(parameters)
    .map(([name, value]) => `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`)
    .join("\n");
  const accountChoices = accounts
    .map(
      (person, index) =>
        `<label><input type="radio" name="account" value="${escape(person.email)}"${index === 0 ? " checked" : ""}> ` +
        `${escape(fullName(person))} (${escape(person.email)})</label>`,
    )
    .join("<br>\n");
  const permissions = scopes
    .map((scope) => `<li>${escape(SCOPE_PERMISSIONS[scope] ?? scope)}</li>`)
    .join("\n");
  return page(
    `Sign in to ${appName}`,
    `<h1>${escape(appName)} wants to access your Google Account</h1>
<form method="post">
${hiddenFields}
<fieldset><legend>Choose an account</legend>
${accountChoices}
</fieldset>
<p>This will allow ${escape(appName)} to:</p>
<ul>
${permissions}
</ul>
<button type="submit" name="decision" value="cancel">Cancel</button>
<button type="submit" name="decision" value="allow">Allow</button>
</form>`,
  );
}

/** Google's wording of a permission, for the scopes the design names; the others show as the scope. */
const SCOPE_PERMISSIONS: Partial<Record<string, string>> = {
  "https://www.googleapis.com/auth/admin.directory.user":
    "See, create and change users in your organisation",
};

/** Google's error page for an authorization request it will not redirect, such as `invalid_client`. */
export function authorizationErrorHtml(status: number, error: string): string {
  return page(
    "Authorization Error",
    `<h1>Access blocked: Authorization Error</h1>\n<p>Error ${status}: ${escape(error)}</p>`,
  );
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body>
${body}
</body>
</html>`;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}
