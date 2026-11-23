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

- **Answers:** HTTP 200 for every answer a connector gives, including a connector error. Any other status, or no answer within 120 seconds, is the container itself failing, and the core reads it as `app_unavailable`. A connector answers within 90 seconds.
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

A connection field of kind `app_session` holds the owner's session in the app. The extension collects it from the owner's Chrome and gives it to the core; this contract never sees that step. The core sends it as a secret in this shape:

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
      "capabilities": ["list_accounts", "suspend", "reactivate"],
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
- **`capabilities`:** `list_accounts`, `suspend` and `reactivate` in v1.
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
- **`status`:** `active` or `suspended`. Pending invitations are not members, and connectors leave them out.
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

- **`action`:** `suspend` or `reactivate`.
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

- **Rules:**
  - Before changing anything, the connector checks that the connection still reaches the same workspace and finds exactly one member with this `sourceKey` and email.
  - After the change, it reads the member again. Success means it saw the new status, never that a click went through.
  - Repeating an action is always safe, so the core may retry it.

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
  - `blocked_by_check`: a CAPTCHA, bot check or MFA prompt stopped the robot. It never tries to get past one.
  - `account_not_found`: no single member matches the `sourceKey` and email.
  - `wrong_workspace`: the key or session reaches a different workspace from the connection's settings. The core shows Reconnect.
  - `not_allowed`: the app refuses this change, for example deactivating the workspace's primary owner.
  - `owner_browser_lost`: the owner's Chrome went away during the call.

## What the core does with errors

The core, not the container, decides what happens after an error. It tries the connector's `runtimes` in order, skipping `owner_browser` when the owner's extension is not connected. On each runtime:

1. **Stop:** `account_not_found`, `not_allowed`, `wrong_workspace` and `permission_missing` end the action, and the owner sees the error.
2. **Try again:** `rate_limited` and `app_unavailable`, three attempts in all.
3. **Move on to the next runtime:** any other error, or attempts used up.

When no runtime is left, the action fails with the last error. The owner sees why, and can try again or make the change by hand.

- **Reconnect:** `authentication_failed` on the server, `permission_missing` and `wrong_workspace` turn the connection to Reconnect, whatever happens to the action.
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
- The suite needs fixtures: for each connector, a connection to its fake app, a member to suspend and reactivate, and a way to make the fake show each error.
- **What it checks:**
  - every answer matches its schema;
  - every error uses a listed code;
  - a request without the debug header gets no `appCalls`;
  - an action repeated twice changes the member once;
  - an action reports the status read afterwards;
  - a runtime the connector does not list is answered with HTTP 400;
  - two containers started from the same image give the same answers;
  - the container works with a read-only file system.
- **Who runs it:**
  - the core's fake connectors container in `packages/fake-apps`;
  - the real connectors container in its own repository.
