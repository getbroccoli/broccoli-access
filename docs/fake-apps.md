# Fake apps

`packages/fake-apps` holds fakes of the apps broccoli-access connects to. Circle 1 needs one: a fake Google. Circle 2 adds a fake connectors container (see "Fake connectors container"). Every circle 1 task is built and checked against it, by automated tests, by agents clicking through the app, and by people running `pnpm dev`. Real Google appears only in the circle's last task, which checks the same journeys against a real test organisation.

## Why

- Nobody has to be in the loop: setup, sign-in and scans all work with no real Google account.
- The fake is the only Google the code meets until the last task, so it behaves like Google on the wire: the same paths, field names, page tokens, signed sign-in tokens, refresh token rules and error bodies. The code under test is the code that will talk to real Google.

## Goals

- Serve, in Google's own shapes, everything circle 1 calls: consent and sign-in, the directory, app grants and grant events.
- Let a browser driven by an agent click through Google's consent step.
- Let tests and agents change the fake's data mid-run and make any call fail with any connector error.
- Serve a seeded company, Acme, whose numbers match the circle 1 design canvas (listed in full under "Seed: Acme").
- Check every fake response against Google's published API descriptions, so the fake cannot drift unnoticed.

## Not goals

- Other Google APIs: Gmail, Drive, groups, or anything that writes.
- Keeping data across restarts.
- Running in a real install.
- Slack's and Linear's own APIs and pages: the connectors repository fakes those for its connectors. This package fakes the connectors container instead.

## Anti-goals

- Connector or sign-in code that behaves differently against the fake.
- Seed numbers that disagree with the canvas.

## Approaches

- **Same as Google on the wire (chosen).** Our real connector and sign-in code run against the fake with only its addresses changed. It is more work in the fake, and the last task should find little.
- **Simplified responses (rejected).** The fake would return our own simpler JSON and the connector would need a fake mode, so the code under test would not be the code that talks to Google.
- **Built on [emulate](https://github.com/vercel-labs/emulate) (considered, not used).** It is an Apache-2.0 framework for local API fakes.
  - Its own Google fake hands out refresh tokens even without `access_type=offline`, and a separate Directory fake could not check the tokens it issues, so the Google fake has to be our own either way.
  - What remains (seeds, reset, free ports, an inspector page) is a few lines in Express, which the app already uses, and not worth a young dependency and a second web framework.
  - Its sign-in code may still be borrowed, keeping the licence notice. Its Slack fake is worth a look when Slack comes back.
- **An in-memory fake connector**, which follows the connector shape in the [data model](data-model.md), is allowed beside the fake Google for fast unit tests of scan and sync. It is never used for end-to-end tests or QA.

## How the app reaches the fake

- Sign-in finds its endpoints from an OpenID Connect discovery address, `GOOGLE_OPENID_CONFIGURATION_URL`. Its default is `https://accounts.google.com/.well-known/openid-configuration`.
- The connector calls the Admin APIs at `GOOGLE_ADMIN_API_URL`, default `https://admin.googleapis.com`.
- The fake's discovery document gives two addresses:
  - browser-facing ones, such as the consent page, at the address the browser can reach;
  - server-to-server ones, such as the token endpoint and the Admin APIs, at the address the app's container can reach.

  With `pnpm dev` in Docker the two differ, so the fake takes both as settings.

- A real install never sets these. The app logs a warning at start when either points somewhere other than Google.
- **Ports:**
  - `pnpm dev` starts the fake on a free port per checkout, beside the app.
  - Integration and end-to-end tests start it in-process on a free port.
- The fake is not part of the production image. Its data lives in memory and resets when it restarts.

## Consent and sign-in

The OAuth 2.0 and OpenID Connect flow, as Google runs it for a web application. Exact paths are the fake's own and are published in its discovery document.

- **Authorization** takes `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `access_type`, `prompt` and `nonce`.
  - An unknown client or an unregistered redirect address shows Google's error page (`invalid_client`, `redirect_uri_mismatch`) instead of redirecting.
  - The consent page shows the app's name, the permissions asked for, a list of Acme accounts to choose from, and Allow and Cancel buttons with stable labels for browsers.
  - Allow redirects with `code` and `state`; Cancel redirects with `error=access_denied`.
  - As in Google, a person who already consented to the same client and scopes skips the consent page unless `prompt=consent`.
- **Token endpoint:**
  - `grant_type=authorization_code` returns `access_token` (valid for 3599 seconds), `id_token`, `scope`, `expires_in` and `token_type: "Bearer"`.
  - As in Google, it returns a `refresh_token` only when `access_type=offline` and the person consents now, on their first consent or with `prompt=consent`. Setup therefore sends `access_type=offline&prompt=consent`, and sign-in sends neither.
  - `grant_type=refresh_token` returns a new access token.
  - A revoked or expired refresh token gets `400 {"error": "invalid_grant", "error_description": "Token has been expired or revoked."}`, and a wrong secret gets `401 {"error": "invalid_client"}`.
- **ID token:** an RS256 JWT, signed with a key published at the discovery document's `jwks_uri`. Its claims: `iss` (`https://accounts.google.com`), `aud` (the client ID), `sub` (the Google user id), `email`, `email_verified`, `hd`, `name`, `given_name`, `family_name`, `nonce`, `iat`, `exp`.
- **User info** returns `sub`, `email`, `email_verified`, `name`, `given_name`, `family_name` and `hd`.
- **Grants:** consenting adds a grant for the consenting client to that person, with its event in the grant log, as in Google. The app's own client therefore appears among the admin's grants. The scan skips it (see the [data model](data-model.md)), so Acme still shows 37 apps.
- Every access token remembers its account and scopes. The Directory and Reports endpoints check both, as Google does (see "Errors").

## Directory

Google's paths under the Admin API address, with a bearer access token.

- `GET /admin/directory/v1/customers/my_customer` needs `admin.directory.customer.readonly`.

  ```json
  {
    "kind": "admin#directory#customer",
    "id": "C03acme01",
    "customerDomain": "acme.example",
    "postalAddress": { "organizationName": "Acme" },
    "customerCreationTime": "2021-03-02T09:00:00.000Z"
  }
  ```

- `GET /admin/directory/v1/users?customer=my_customer` needs `admin.directory.user.readonly`.
  - It takes `maxResults` (1 to 500, default 100), `pageToken`, `orderBy=email` and `projection` (`basic` or `full`).
  - It returns `users` and, while more remain, an opaque `nextPageToken`.

  ```json
  {
    "kind": "admin#directory#users",
    "users": [
      {
        "kind": "admin#directory#user",
        "id": "104857392018374650123",
        "primaryEmail": "ana@acme.example",
        "name": { "givenName": "Ana", "familyName": "Ruiz", "fullName": "Ana Ruiz" },
        "isAdmin": false,
        "suspended": true,
        "orgUnitPath": "/",
        "relations": [{ "value": "david@acme.example", "type": "manager" }],
        "customerId": "C03acme01",
        "creationTime": "2022-05-10T08:00:00.000Z"
      }
    ],
    "nextPageToken": "Cg1hbmFAYWNtZS5leGFtcGxl"
  }
  ```

- `GET /admin/directory/v1/users/{userKey}/photos/thumbnail` needs `admin.directory.user.readonly`; it returns `404` with Google's not-found body when a person has no photo. `users.list` also gives `thumbnailPhotoEtag` for people with a photo.

  ```json
  {
    "kind": "admin#directory#user#photo",
    "id": "104857392018374650123",
    "etag": "\"p1\"",
    "primaryEmail": "ana@acme.example",
    "mimeType": "image/png",
    "width": 96,
    "height": 96,
    "photoData": "<web-safe base64 PNG>"
  }
  ```

- `GET /admin/directory/v1/users/{userKey}/tokens` needs `admin.directory.user.security`. `userKey` is the user id or email. The list is not paged, as in Google.

  ```json
  {
    "kind": "admin#directory#tokenList",
    "items": [
      {
        "kind": "admin#directory#token",
        "clientId": "871234567890-figma.apps.googleusercontent.com",
        "displayText": "Figma",
        "scopes": ["openid", "email", "profile"],
        "userKey": "104857392018374650123",
        "anonymous": false,
        "nativeApp": false
      }
    ]
  }
  ```

## Grant events

- `GET /admin/reports/v1/activity/users/all/applications/token` needs `admin.reports.audit.readonly`.
  - It takes `eventName=authorize`, `startTime`, `endTime`, `maxResults` (up to 1000) and `pageToken`.
  - It returns only events from the last 180 days, newest first. An older grant has no event, as in Google, and the app then shows "Before" the log's start.

  ```json
  {
    "kind": "admin#reports#activities",
    "items": [
      {
        "kind": "admin#reports#activity",
        "id": {
          "time": "2026-09-10T14:12:00.000Z",
          "uniqueQualifier": "-7310462093812215871",
          "applicationName": "token",
          "customerId": "C03acme01"
        },
        "actor": { "email": "chloe@acme.example", "profileId": "104857392018374650456" },
        "events": [
          {
            "type": "auth",
            "name": "authorize",
            "parameters": [
              { "name": "client_id", "value": "301234567890-claude.apps.googleusercontent.com" },
              { "name": "app_name", "value": "Claude" },
              { "name": "client_type", "value": "WEB" },
              { "name": "scope", "multiValue": ["openid", "email", "profile"] }
            ]
          }
        ]
      }
    ]
  }
  ```

## Errors

Google's error bodies, one way to produce each connector error:

- `authentication_failed`: an expired or unknown access token gets `401` with `"status": "UNAUTHENTICATED"`. A revoked refresh token gets `invalid_grant` from the token endpoint.
- `permission_missing`: a token without the endpoint's scope gets `403` with reason `insufficientPermissions`. An account that is not a super admin gets `403` with reason `forbidden` and the message "Not Authorized to access this resource/api".
- `rate_limited`: `429` with reason `rateLimitExceeded`.
- `app_unavailable`: `503` with reason `backendError`, or no answer before the caller's timeout.
- `unexpected_response`: `200` with a body that breaks Google's schema.

```json
{
  "error": {
    "code": 403,
    "message": "Request had insufficient authentication scopes.",
    "errors": [
      {
        "message": "Insufficient Permission",
        "domain": "global",
        "reason": "insufficientPermissions"
      }
    ],
    "status": "PERMISSION_DENIED"
  }
}
```

## Control endpoints

Only the fake has these, under `/_fake`. They have no authentication, so the fake listens only on localhost or the test network.

- `POST /_fake/reset`: back to the seed.
- `GET /_fake/state`: counts of people, suspended people, apps, grants and events.
- `POST /_fake/users/{email}/suspend` and `/unsuspend`.
- `POST /_fake/grants` with `email`, `clientId`, `appName` and an optional `grantedAt`. It also adds the event when the date falls inside the log. `DELETE /_fake/grants` takes `email` and `clientId`.
- `POST /_fake/failures` with an endpoint, a connector error and a count: the next calls to that endpoint fail that way.
- `POST /_fake/tokens/expire` expires every access token. `POST /_fake/tokens/revoke` revokes every refresh token.
- `POST /_fake/clients` registers another OAuth client with its secret and redirect addresses.

## Seed: Acme

These numbers are the circle 1 design canvas's; screens and checks rely on them.

- **Customer:** `C03acme01`, domain `acme.example`, organisation "Acme".
- **OAuth client**, the "own Google app" used in development and tests:
  - client ID `123456789012-acme.apps.googleusercontent.com`, with a fixed secret;
  - the redirect addresses `pnpm dev` and the tests use, registered at start.
- **42 people:**
  - Mia Novak (`admin@acme.example`) is the only super admin.
  - Named people: Ana Ruiz, Ben Ito, Chloé Martin, David Okafor, Elif Demir, Farah Haddad, Gabriel Silva, Hannah Weber, Ivan Petrov, Jun Park and Lena Fischer. Generated names fill the rest.
  - Ana Ruiz and Ben Ito are suspended.
  - Managers form a small tree under Mia. Ana's manager is David.
  - The 11 named people get a generated placeholder portrait (made up, no real faces); generated people have none.
- **37 apps**, each with a stable client ID: Slack 41 people, Notion 31, Figma 16, Miro 12, Loom 11, Claude 9, ChatGPT 7, Canva 5, Calendly 4, Zoom 4, Typeform 3, Grammarly 2, and 25 more apps with 1 or 2 people each.
  - Apps in the built-in catalog use the client IDs the catalog lists, so they match it in development.
  - Everyone except Ivan Petrov has Slack.
- **Each named person's apps:**
  - Ana: Figma, Notion, Slack
  - Ben: Slack
  - Chloé: Figma, Notion, Slack, Miro, Loom
  - David: Figma, Miro, Notion, Slack
  - Elif: Figma, Notion, Slack
  - Farah: Claude, Figma, Notion, Slack, Loom
  - Gabriel: Claude, Figma, Slack
  - Hannah: Figma, Loom, Notion, Slack
  - Ivan: Notion
  - Jun: Claude, Figma, Miro, Notion, Slack
  - Lena: Figma and Slack

  Generated people fill the rest of each app's count.

- **Grant dates:**
  - Most grants are older than the log and have no event.
  - These have events: the first grants of Claude (141 days before start), ChatGPT (162), Calendly (107), Typeform (52) and Grammarly (40); Gabriel's Figma grant (101); and Lena's Figma grant (76).
- Dates are offsets from the moment the fake starts, so the 180-day log always splits the seed the same way. The canvas shows that split on 21 Nov 2026.

## Keeping the fake honest

- The package keeps copies of Google's discovery documents for Directory v1 and Reports v1, with the date each was fetched. A test validates every fake response against them, both on the seed and after control changes.
- Sign-in responses are checked against Google's OpenID Connect discovery document and its token response fields.
- The circle's last task compares fake and real responses field by field on the test organisation, then updates the fake and these copies.

## Which tasks use what

- **Building the fake:** the fake, the seed, the control endpoints and the honesty test, plus `pnpm dev` and test wiring.
- **Setup and sign-in:** consent, the token endpoint, ID tokens and user info.
- **Scanning people:** customers and users.
- **Scanning apps:** grants and grant events.
- **People and Settings checks:** the control endpoints, to suspend someone or add a grant, then scan.

## Fake connectors container

Circle 2's core is built and checked against a fake of the connectors container, as circle 1's is against the fake Google. It speaks the [connector contract](connector-contract.md) on the wire, so the core's connector client is the code that will talk to the real container. It answers for Acme's Slack and Linear workspaces from its own memory.

### Goals

- Serve the four contract calls for `slack` and `linear`, with the manifest the real container will serve.
- Make any call fail with any contract error, so every failure and Reconnect can be tested.
- Give a Slack sign-in page to test the extension's hand-over.
- Pass the contract's conformance suite.

### Not goals

- Slack's real pages or Linear's real API. The connectors repository fakes those, and its connectors are tested there.
- Keeping data across restarts, or running in a real install.

### How it behaves

- **Manifest:** `slack` with runtime `server`, an `app_session` field whose `domains` are the fake's own host and whose `storageKeys` name the fake's token, a notice and an `adminUrl`; `linear` with runtime `server`, an `apiKey` text field, no notice.
- **Linear:** the key `lin_api_acme_fake` reaches Acme's Linear; any other key fails with `authentication_failed`.
- **Slack sign-in:** `GET /slack/signin` shows "Sign in as Mia Novak". It sets the cookie `d` on the fake's host and keeps a token in local storage, as Slack's page does; both are the session the extension hands over. The fake accepts only sessions it issued and has not expired.
- **Changes:** the fake changes the member in memory and answers as the contract says, after a short delay that a control can lengthen.

### Control endpoints

Under `/_fake`, as for the fake Google:

- `POST /_fake/reset`: back to the seed.
- `GET /_fake/state`: the members of each workspace, with their status.
- `POST /_fake/{connector}/members/{email}/suspend` and `/reactivate`: change a member as an admin would in the app.
- `POST /_fake/failures` with `connector`, `call` (`connections/test`, `accounts/list` or `actions/run`), an error code and a count: the next matching calls fail that way.
- `POST /_fake/slack/sessions/expire`: every Slack session fails with `authentication_failed`, until the owner signs in again.
- `POST /_fake/linear/keys/revoke`: the Linear key fails with `authentication_failed`.
- `POST /_fake/delay` with milliseconds: how long each answer takes, so the progress state can be seen.

### Seed: Acme in Slack and Linear

- **Slack:** workspace "Acme", team id `T04ACME`, domain `acme`.
  - Members: the 41 people the fake Google gives Slack, with the same emails and stable member ids.
  - Mia Novak is the primary owner, and the member the session belongs to.
  - Ana Ruiz and Ben Ito are active, so they show as suspended with access.
  - Elif Demir is deactivated, to show Enable.
  - One pending invitation, `new.hire@acme.example`, which the list leaves out.
- **Linear:** workspace "Acme", url key `acme`.
  - Members: Mia Novak (admin, owner of the key), Ana Ruiz, Chloé Martin, David Okafor, Gabriel Silva and Jun Park, all active; Hannah Weber, suspended.
  - One pending invitation, which the list leaves out.

### Which tasks use what

- **Fake connectors container:** the fake, the seed, the control endpoints and the conformance suite.
- **Connect Linear, Disable and Enable, failed changes and Activity:** Linear, failures and the key revoke.
- **Connect Slack, daily scans, Reconnect:** the Slack sign-in, the session expiry and failures.

## Left to the builder

- The file layout, the generated names and the page token format, which only has to be opaque.
- The JWT library, and how the signing key is created at start.
- How the fake connectors container drives the owner's tab, as long as it uses only the one-time address.

The fake is an Express app, like the API.
