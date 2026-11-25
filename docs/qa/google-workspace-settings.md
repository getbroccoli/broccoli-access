# QA for Google Workspace settings

Check the directory, scans, Change Google app and the integration user in Settings → Google Workspace.

## Setup

1. Start the stack, connect Google Workspace as `admin@acme.example` and move setup on as in [QA setup](setup.md).
2. Use the browser that connected Google Workspace. Note the fake Google's and the fake connectors' addresses that `pnpm dev` prints; their controls are under `/_fake` (see `docs/fake-apps.md` and "The fake connectors container" in `docs/testing.md`).

## Google Workspace page

- [ ] Settings opens on "Google Workspace", first in the settings menu, with "Where Broccoli Access finds your people, and the user it signs in to apps with." under the title.
- [ ] "Directory" heads the Google Workspace card. "Integration user" heads the integration user card below it.
- [ ] The card shows "Google Workspace" with "Connected", "acme.example, connected as admin@acme.example." and either "Broccoli app" or your Google app’s client ID and "Scanned today at HH:MM." with the time of the last scan in the browser's time zone.
- [ ] "Scan now" and "Change Google app" sit at the card's right; at 390 px wide they wrap under the text.

## Scan now

- [ ] A Google Workspace scan that fails (fake Google `POST /_fake/tokens/revoke`, then "Scan now") shows "Reconnect". Choose it to open Change Google app with the current app selected. For your own app, re-enter its client ID and secret and choose "Connect as Google admin". After consent, Scan now clears the failure without a reload.

- [ ] Suspend `elif@acme.example` in the fake Google (`POST <fake>/_fake/users/elif@acme.example/suspend`), then choose "Scan now": the line shows "Scanning…" and the button is disabled; when the scan ends, the line shows the new time without a reload, and People shows Elif suspended.
- [ ] Double-clicking "Scan now" starts one scan only.
- [ ] With the fake failing the directory (`POST <fake>/_fake/failures` for `directory.users.list` with `app_unavailable`, count 3), "Scan now" ends with "The last scan failed. Try Scan now again." under the previous scan's time.

## Change Google app

- [ ] "Change Google app" opens `/settings/google-workspace/google-app` titled "Change Google app", with both app choices; choosing your own app reveals the redirect address, Google Cloud steps and credential fields; "Google Workspace" stays highlighted in the menu.
- [ ] Register a second client in the fake (`POST <fake>/_fake/clients` with a client ID, secret and the redirect address), enter it and choose "Connect as Google admin": the fake's consent page names the new client; allowing as `admin@acme.example` returns to Google Workspace, and People is unchanged.
- [ ] Choosing Cancel at Google returns to the change page with "You cancelled at Google. The Google app hasn’t changed."
- [ ] Consenting as a user who is not a super admin returns with "That Google account isn’t a super admin. Sign in with a super admin account."
- [ ] After a change, signing out and "Sign in with Google" asks Google with the new client and lands signed in.

## Integration user

Start without an integration user (`pnpm dev --drop-db`, then setup again).

- [ ] The Google Workspace card shows "Reads only" beside "Connected".
- [ ] "Integration user" heads a green card below "Directory": "Give Broccoli Access its own user", "An integration user is a separate Google Workspace account, such as broccoli@acme.example, that Broccoli Access signs in to your apps with. It creates, changes and removes accounts as this user, not with your own session.", three points ("If an app blocks automation, it blocks this user, not you.", "Keeps working when you are signed out or away.", "Suspend it in Google to stop everything at once.") and "Create integration user".
- [ ] "Create integration user" opens the dialog "Create the integration user": "Its email address" holds "broccoli" before a fixed "@acme.example", with "Google will ask you to allow creating users. This uses one paid Google seat.", "Cancel" and "Continue to Google"; Escape and "Cancel" close it.
- [ ] At 390 px wide, "Create integration user" wraps under the card's text, and its dialog fits the screen without scrolling sideways.
- [ ] After "Continue to Google", the browser's Back returns to Google Workspace with the dialog usable again: "Cancel" closes it and "Continue to Google" works.
- [ ] An address such as "bro ccoli" shows "Use letters and digits, with single dots, hyphens or underscores between them." under the field and stays in the dialog.
- [ ] "Continue to Google" opens the fake's consent page, which lists only "See, create and change users in your organisation", also after another account allowed it. Cancel there returns to Google Workspace with "You cancelled at Google. No integration user was created." in the card, and the Google Workspace card still shows "Reads only".
- [ ] After `POST <fake>/_fake/consent/refuse-scope` with `{"scope":"https://www.googleapis.com/auth/admin.directory.user"}`, Allow returns with "Google didn’t get your permission to create users, so no integration user was created. Try again and allow it."
- [ ] With the address "ana", Allow returns with "That address is already used in your Google Workspace. Pick another one."
- [ ] Choosing Chloé Martin on the consent page returns with "That Google account isn’t a super admin. Sign in with a super admin account."
- [ ] With "broccoli", Allow as Mia Novak returns to Google Workspace: the card shows "broccoli@acme.example" with "Created", "Signed in to Google · Two-step sign-in on" and "Open in Google admin", which opens `https://admin.google.com` in a new tab; the Google Workspace card shows "Can create and change users"; and `GET <fake>/_fake/state` lists `broccoli@acme.example` under `createdUsers`, with no password.
      Each of the next three checks creates the integration user again, so start each without one (`pnpm dev --drop-db`, then setup again).

- [ ] With the fake connectors slowed (`POST <fake connectors>/_fake/delay` with `{"milliseconds": 5000}`) before Allow, the card first shows "Setting up" with "Broccoli Access is signing in to Google as this user and setting up its two-step sign-in.", then turns to "Created" by itself. Set the delay back to 250.
- [ ] With `POST <fake connectors>/_fake/failures` and `{"call": "integration-user/setup", "code": "blocked_by_check", "count": 1}` before Allow, the card turns amber with "Needs you", "Google showed a check that needs a person, so Broccoli Access stopped signing in. It never gets around a check. Try again later." and "Try again"; a reload keeps it. "Try again" turns the card to "Created" with "Signed in to Google · Two-step sign-in on".
- [ ] The same with the code `authentication_failed` shows "Google refused this user’s password or two-step code. Check in Google admin that the user is active, then try again.", and with `app_unavailable` "Broccoli Access couldn’t sign in through the connectors container. Check that it is set up and running, then try again."
- [ ] After a restart of `pnpm dev`, without dropping the database, while the card shows "Needs you", it reads "Broccoli Access couldn’t finish signing in to Google as this user. Try again."; the fakes forget the user on a restart, so "Try again" then shows the refused sign-in.
- [ ] Connected with the Broccoli Google app, the card shows "Creating it needs your own Google app. Change the Google app above first." and no "Create integration user".
- [ ] After "Scan now", People does not list `broccoli@acme.example`, and its count is unchanged.

## Shared Google app

- [ ] Switch own app → Broccoli app → own app. Connection ID, owner, people and approved apps stay; a cancelled or refused change leaves the old app working.
- [ ] After each switch, Scan now excludes grants to both current and previous Google apps.
- [ ] Switch back to the Broccoli app for the next two checks. A revoked shared refresh token shows Reconnect. Choose "Reconnect" to open Change Google app, consent again, then check that Scan now succeeds.
- [ ] A relay outage fails the scan and permits a retry; it does not show Reconnect.
