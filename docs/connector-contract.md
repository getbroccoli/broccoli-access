# Connector contract

How the core talks to the connectors container. The core owns this contract; `packages/connector-contract` holds its schemas and the conformance suite that every connectors container must pass. The connectors repository depends on that package through git, pinned to a release tag.

## Basics

- **Transport:** HTTP with JSON on port 4000, inside the Compose network only. The port is never published.
- **No authentication:** the container keeps nothing. A caller can only do what the secrets it sends already allow, and only the core holds those secrets.
- **Stateless:** each call carries the whole connection, and nothing survives a call. The container runs with a read-only file system and a temporary folder for the browser. Each call starts its own browser and closes it before answering.
- **Versions:** every path starts with `/v1`. Within v1, changes are additive only:
  - new optional fields;
  - new connectors, capabilities and error codes. The core reads an unknown error code as `unexpected_response`.

  A breaking change becomes `/v2`, and the container serves both versions for one release.

- **Answers:** HTTP 200 for every answer a connector gives, including a connector error. Any other status, or no answer within 120 seconds, is the container itself failing, and the core reads it as `app_unavailable`. A connector answers within 90 seconds. The two integration user calls sign in through several pages: they answer within 180 seconds, and the core waits 240.
- **Formats:** dates are ISO 8601, and emails are lowercased.
- **Logs:** the container logs to standard output, with connector keys, actions and error codes only. It never logs secrets, cookies, emails or names.

## The connection

Every call except the manifest carries `connector` and `connection`:

```json
{
  "connector": "linear",
  "connection": {
    "settings": { "organizationId": "4a1c…", "urlKey": "acme" },
    "secrets": { "apiKey": "lin_api_…" }
  }
}
```

- **Settings and secrets:** only the connector reads them. The core treats both as opaque JSON, stores secrets encrypted and sends them only to the container.
- **Updates:** any successful answer may carry `connection` with new `settings` or `secrets`, such as renewed cookies, the workspace id found on the first test, or a renewed session. Each object it carries replaces the stored one, and the core saves it before using the rest of the answer.

### App sessions

A connection field of kind `app_session` holds a signed-in session in the app. It is the owner's own, which the extension collects from the owner's Chrome and gives to the core, a step this contract never sees; or the integration user's, which the container makes itself (see [POST /v1/connections/sign-in](#post-v1connectionssign-in)). The core sends it as a secret in this shape:

```json
{
  "cookies": [
    {
      "name": "d",
      "value": "…",
      "domain": ".slack.com",
      "path": "/",
      "expires": 1798000000,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "storage": { "localConfig_v2": "…" }
}
```

- It holds only cookies for the field's `domains`, and `storage`: the values the app's signed-in page keeps in local storage under the field's `storageKeys`, such as the token Slack's page uses for its own calls.
- The connector uses them as they are, with its own user agent. It never pretends to be the owner's browser.
- Both kinds of session have the same shape, so every other call works the same with either.

## Runtimes

Where a call runs. `connections/test`, `accounts/list` and `actions/run` carry a `runtime`:

- `{ "kind": "server" }`: the container acts by itself, through the app's API or in its own browser with the connection's app session.
- `{ "kind": "owner_browser", "url": "ws://broccoli-access:3000/internal/owner-browser/<one-time id>" }`: the owner's Chrome. The container drives one tab there over the Chrome DevTools Protocol, passed on by the core and the extension. The owner's own sign-in is used, so `secrets` may be empty. The address works for this call only.

- **Only listed runtimes:** the core sends only a runtime the connector lists in `runtimes`. Any other is answered with HTTP 400.
- **In the owner's browser:** the connector never reads cookies, and never returns secrets in a `connection` update. The extension passes on only the commands a robot needs, in its one tab.

## GET /v1/connectors

What the container offers. The core shows connections and actions from this list, so it needs no code for any app.

```json
{
  "connectors": [
    {
      "key": "slack",
      "version": 1,
      "name": "Slack",
      "appDomain": "slack.com",
      "runtimes": ["server"],
      "capabilities": [
        "list_accounts",
        "suspend",
        "reactivate",
        "invite",
        "list_invitations",
        "remove",
        "sign_in"
      ],
      "roles": [
        { "key": "member", "name": "Member", "isDefault": true },
        { "key": "admin", "name": "Admin", "isDefault": false }
      ],
      "findingKind": "slack_members",
      "connectionFields": [
        {
          "key": "appSession",
          "kind": "app_session",
          "label": "Slack admin session",
          "help": "Sign in to Slack in Chrome as a Workspace Admin, then connect.",
          "domains": ["slack.com"],
          "storageKeys": ["localConfig_v2"]
        }
      ],
      "notice": "Slack's terms may not allow automated access to its pages. broccoli-access acts only when you ask, in your own name, and stops at any check Slack shows.",
      "adminUrl": "https://{teamDomain}.slack.com/admin"
    }
  ]
}
```

- **`runtimes`:** where calls can run, in the order the core tries them: `server`, `owner_browser` or both. An API or SCIM connector lists `server` only, and so does Slack, which makes the calls Slack's own pages make. The core needs no other word for how a connector works.
- **`capabilities`:** `list_accounts`, `suspend`, `reactivate`, `invite`, `list_invitations`, `remove` and `sign_in` in v1.
  - `sign_in`: the container can sign in to the app as the integration user. The core then offers the integration user in Connect, beside the owner's own session.
- `suspend` and `reactivate` are listed together or not at all. A connector may list no action, only `list_accounts`: the core then shows its members and changes nothing.
- **`roles`:** optional: the roles a member can be invited with, each `{ "key", "name", "isDefault" }`, with exactly one default. A connector without it invites with the app's default only.
- **`connectionFields`:**
  - kind `text`: a value the owner types or pastes, such as an API key, with `secret` set to true or false;
  - kind `app_session`: always secret, with its `domains` and optional `storageKeys`.
- **`notice`:** shown before the first connection, which the owner accepts. It is null for an API connector.
- **`adminUrl`:** where the owner goes to make a failed change by hand. Its `{placeholders}` name fields of the connection's settings.

## POST /v1/connections/test

Checks a connection and finds what it is connected to. The core calls it when the owner connects or reconnects, and before saving any change to a connection.

- **Request:** `connector`, `connection` and `runtime`.
- **Answer:** an `organizationName`, plus a `domain` (null for an app without one), and usually a `connection` update with the workspace's settings:

```json
{
  "details": { "organizationName": "Acme", "domain": null },
  "connection": { "settings": { "organizationId": "4a1c…", "urlKey": "acme" } }
}
```

- **Several workspaces:** when an app session reaches several workspaces, the connector uses the one the app opens first. The owner sees its name before confirming.

## POST /v1/accounts/list

One page of the app's members. The core calls it in every scan, every day.

- **Request:** `connector`, `connection`, `runtime`, and `cursor` (null for the first page).
- **Answer:**

```json
{
  "accounts": [
    {
      "sourceKey": "U04ABCDEF",
      "raw": { "id": "U04ABCDEF", "deleted": false },
      "values": {
        "email": "jane@acme.example",
        "status": "active",
        "displayName": "Jane Doe",
        "isConnectionUser": false
      }
    }
  ],
  "nextCursor": null,
  "connection": { "secrets": { "appSession": { "cookies": [] } } }
}
```

- **`sourceKey`:** the app's own id for the member, unique within the workspace.
- **`status`:** `active` or `suspended`. Pending invitations are not members, and connectors leave them out of `accounts`.
- **`invitations`:** optional, only from a connector that lists `list_invitations`: the app's pending invitations, each `{ "email", "invitedAt", "expiresAt" }`, with `invitedAt` and `expiresAt` null when the app does not give them. All pages of one scan together hold every pending invitation in the workspace; a connector may give them all on one page.
- **`isConnectionUser`:** true for the member whose key or session the connection uses. The core never offers Disable on that member.
- **A robot:** may answer with every member on one page and `nextCursor` null.

## POST /v1/actions/run

Makes one change to one member, then reads the member again.

```json
{
  "connector": "slack",
  "connection": { "settings": {}, "secrets": {} },
  "action": "suspend",
  "account": { "sourceKey": "U04ABCDEF", "email": "jane@acme.example" },
  "runtime": { "kind": "server" }
}
```

- **`action`:** `suspend`, `reactivate`, `invite` or `remove`.
  - For `invite`, `account` holds `email` and an optional `role`, one of the connector's `roles` keys. Without a role, the app invites that email with the default role, and with the app's default channels or teams. The core sends a role only to a connector that lists `roles`; a role the connector does not list is answered with HTTP 400.
  - For `remove`, the app deletes the member, which cannot be undone.
- **`runtime`:** see [Runtimes](#runtimes).
- **Answer:** the member as read after the change, and whether anything changed. An action on a member who is already in that status changes nothing and succeeds.

```json
{
  "changed": true,
  "account": {
    "sourceKey": "U04ABCDEF",
    "values": {
      "email": "jane@acme.example",
      "status": "suspended",
      "displayName": "Jane Doe",
      "isConnectionUser": false
    }
  }
}
```

- **`invite`'s answer:** `changed`, and either `invitation`, the pending invitation read after the call as `{ "email", "invitedAt", "expiresAt" }`, or `account`, read back after the call, when the email already has a member or the app adds the person as a member at once. An email that already has a member or a pending invitation succeeds with `changed: false`, and no second invitation is sent.
- **`remove`'s answer:** `{ "changed": true, "removed": true }`, with no `account`. A member who is already gone succeeds with `changed: false`. The connection's own member is answered with `not_allowed`.
- **Rules:**
  - Before changing anything, the connector checks that the connection still reaches the same workspace and finds exactly one member with this `sourceKey` and email. For `invite`, it checks the workspace only. For `remove`, no member with this `sourceKey` and email means already gone; more than one is `account_not_found`.
  - For `remove`, a connector that lists `suspend` removes only a suspended member: an active member is answered with `not_allowed`, and nothing changes. A connector that cannot suspend removes an active member.
  - After the change, it reads the member again. Success means it saw the new status, never that a click went through. For `invite`, it reads the invitation, or the member, back. For `remove`, it reads the members again and the member is not among them.
  - Repeating an action is always safe, so the core may retry it.

## POST /v1/integration-user/setup

Sets up two-step sign-in for the integration user in the directory, so that the container can sign in as it later. The core calls it once, after it has created the integration user.

- **Request:** the integration user as the directory knows it:

  ```json
  { "integrationUser": { "email": "broccoli@acme.example", "password": "…", "totpSecret": null } }
  ```

- **What the container does:** in its own browser it signs in to the directory's sign-in page with the email and password, turns on two-step sign-in with an authenticator app, and reads the secret the page shows.
- **Answer:** `{ "totpSecret": "…" }`. The core stores it encrypted with the password. With a `totpSecret` in the request, the container signs in with it, changes nothing and answers with the same secret, so the call is safe to repeat.
- **Errors:** `authentication_failed` when the directory refuses the password or the code; `blocked_by_check` when it shows a CAPTCHA or any check the container has no secret for.

## POST /v1/connections/sign-in

Signs in to the app as the integration user and returns a connection. The core calls it when the owner connects an app with the integration user, and again whenever that connection's session stops working.

- **Only for a connector that lists `sign_in`.** Any other is answered with HTTP 400.
- **Request:** `connector`, `integrationUser` as above, and `connection`: null the first time, the stored one when renewing.

  ```json
  {
    "connector": "slack",
    "integrationUser": { "email": "broccoli@acme.example", "password": "…", "totpSecret": "…" },
    "connection": null
  }
  ```

- **What the container does**, in its own browser:
  1. signs in to the directory as the integration user, with its password and the code from its two-step secret;
  2. signs in to the app with "Sign in with Google" where the app offers it, and otherwise with the code or link the app sends to the integration user's mailbox, read in that same browser;
  3. joins the workspace the integration user was invited to, when it is not a member yet;
  4. checks that the integration user is an admin there.
- **Answer:** as `connections/test`: `details`, and a `connection` with the workspace's `settings` and the session in `secrets`.
- **Renewing:** with a stored `connection`, the container signs in to that workspace. A session that reaches another workspace is `wrong_workspace`.
- **Several workspaces:** when the integration user is invited to several, the first time is answered with `unexpected_response`. One instance connects one workspace per app.
- **Errors:**
  - `not_invited`: the integration user has no invitation and no account in the app;
  - `permission_missing`: it is a member, but not an admin;
  - `authentication_failed`: the directory refused its password or code;
  - `blocked_by_check`: the directory or the app showed a CAPTCHA or another check.
- **Rules:** the container never hides that it is automated. It answers a two-step prompt only with the integration user's own secret, and stops at every other check.

## Errors

A connector error answers with HTTP 200 and:

```json
{ "error": { "code": "blocked_by_check", "screenshot": "<base64 PNG>" } }
```

- **`screenshot`:** optional, robots only, at most 1 MB. It shows what the robot saw when it stopped, and the core keeps it for the owner. The `error` object never carries the app's raw answer; a debug answer carries the app's redacted replies beside it, in `appCalls` (see "Debug: the app's calls").
- **The codes:**
  - `authentication_failed`: the key was revoked, or the session expired or was signed out. The core shows Reconnect.
  - `permission_missing`: the connected user is no longer an admin. The core shows Reconnect.
  - `rate_limited`, `app_unavailable`: the core tries the call again.
  - `unexpected_response`: an answer or page the connector does not understand, such as a page the app changed.
  - `blocked_by_check`: a CAPTCHA, a bot check, or a two-step prompt the connector has no secret for, stopped it. It never tries to get past one.
  - `account_not_found`: no single member matches the `sourceKey` and email.
  - `wrong_workspace`: the key or session reaches a different workspace from the connection's settings. The core shows Reconnect.
  - `not_allowed`: the app refuses this change, for example deactivating the workspace's primary owner.
  - `owner_browser_lost`: the owner's Chrome went away during the call.
  - `not_invited`: the integration user has no invitation and no account in the app. Only `connections/sign-in` gives it.

## What the core does with errors

The core, not the container, decides what happens after an error. It tries the connector's `runtimes` in order, skipping `owner_browser` when the owner's extension is not connected. On each runtime:

1. **Stop:** `account_not_found`, `not_allowed`, `wrong_workspace` and `permission_missing` end the action, and the owner sees the error.
2. **Try again:** `rate_limited` and `app_unavailable`, three attempts in all.
3. **Move on to the next runtime:** any other error, or attempts used up.

When no runtime is left, the action fails with the last error. The owner sees why, and can try again or make the change by hand.

- **Reconnect:** `authentication_failed` on the server, `permission_missing` and `wrong_workspace` turn the connection to Reconnect, whatever happens to the action.
- **A connection made by sign-in renews first.** On `authentication_failed`, the core calls `connections/sign-in` with the stored connection, saves the new session and runs the call again, once. The connection turns to Reconnect only when that sign-in fails, with its error as the cause.
- **`not_invited`** ends connecting, and the owner sees what to do: invite the integration user in the app.
- **Connecting and scans:** follow the same order, and end with the error shown to the owner.
- **The screenshot:** kept on the action, so the owner sees what the robot saw.

## Debug: the app's calls

To check a connector against the real app, a caller can ask for every call the connector made to the app.

- **Request:** the header `x-debug: app-calls` on `connections/test`, `accounts/list` or `actions/run`. Only the connectors repository's harness sends it; the core never does.
- **Answer:** the answer, or the connector error, may carry `appCalls`, in call order:

  ```json
  {
    "error": { "code": "authentication_failed" },
    "appCalls": [
      {
        "call": "POST /api/auth.test",
        "sent": { "token": "[redacted]" },
        "status": 200,
        "reply": { "ok": false, "error": "invalid_auth" }
      }
    ]
  }
  ```

  - `call`: the HTTP method and the app's path, without host or query;
  - `sent`: the arguments sent, as an object; `null` when none;
  - `status`: the HTTP status; `null` when the app never answered;
  - `reply`: the app's reply, parsed JSON, else text; `null` when the app never answered or the connector did not read it.

- **Redaction:** the container never puts request headers in `sent`, and redacts cookies, tokens and keys in `sent` and `reply`: by key name, and by every secret value of 16 characters or more in the connection or in what was sent, wherever it reappears.
- **Emails and names:** `appCalls` may hold them, and whatever else the app answered, beside the `error` object, never in it. The logs stay as "Logs" says.
- **Without the header:** no answer carries `appCalls`. A container without debug support, such as the core's fake connectors container, conforms by ignoring the header.

## Conformance

- `packages/connector-contract` exports a schema for every request and answer, and a suite that runs against any container's address.
- The suite needs fixtures: for each connector, a connection to its fake app and a way to make the fake show each error; for one that lists `suspend` and `reactivate`, a member to suspend and reactivate, and, for a connector that lists `invite`, an email with no member; for one that lists `remove`, a member to remove; for one that lists `sign_in`, an integration user that is invited as an admin.
- **What it checks:**
  - every answer matches its schema;
  - every error uses a listed code;
  - a request without the debug header gets no `appCalls`;
  - for a connector that lists `suspend` and `reactivate`, each repeated twice changes the member once;
  - errors are caused through the first action the connector lists, in the order `suspend`, `invite`, `remove`, or through `accounts/list` when it lists none;
  - for a connector that lists `remove`: removing the connection's own member is `not_allowed` only when its list marks one member `isConnectionUser`, and is skipped when it marks none (a key that belongs to no person); removing an active member is `not_allowed` only when the connector also lists `suspend`.
  - an action reports the status read afterwards;
  - `invite` repeated twice sends one invitation;
  - for a connector that lists `roles`, exactly one role is the default, and an invite with a role it does not list is answered with HTTP 400;
  - for a connector that lists `remove`, a removed member is gone from the next list, `remove` repeated twice succeeds with `changed: false` the second time;
  - for a connector that lists `sign_in`, `connections/sign-in` answers with a connection that `accounts/list` accepts, and gives `not_invited`, `permission_missing` and `blocked_by_check` when the fixture makes the app show them;
  - for a connector that lists `list_invitations`, the next list returns the invitation `invite` just sent;
  - a runtime the connector does not list is answered with HTTP 400;
  - two containers started from the same image give the same answers;
  - the container works with a read-only file system.
- **Who runs it:**
  - the core's fake connectors container in `packages/fake-apps`;
  - the real connectors container in its own repository.
