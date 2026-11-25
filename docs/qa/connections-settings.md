# QA: Connections settings

A manual check of Settings → Connections against a development stack: the Google Workspace card, "Scan now", "Change Google app", the integration user and the apps the connectors container connects.

## Setup

1. Start the stack, connect Google Workspace as `admin@acme.example` and move setup on as in [QA setup](setup.md).
2. Use the browser that connected Google Workspace. Note the fake Google's and the fake connectors' addresses that `pnpm dev` prints; their controls are under `/_fake` (see `docs/fake-apps.md` and "The fake connectors container" in `docs/testing.md`).

## Connections page

- [ ] Settings opens on "Connections", first in the settings menu, with "Where Broccoli Access finds your people and their accounts." under the title.
- [ ] "Directory" heads the Google Workspace card; "Apps", with "Connect an app to see its members, and disable or enable their accounts from here.", heads a card for Slack and one for Linear below it.
- [ ] The card shows "Google Workspace" with "Connected", "acme.example, connected as admin@acme.example." and either "Broccoli app" or your Google app’s client ID and "Scanned today at HH:MM." with the time of the last scan in the browser's time zone.
- [ ] "Scan now" and "Change Google app" sit at the card's right; at 390 px wide they wrap under the text.

## Scan now

- [ ] Suspend `elif@acme.example` in the fake Google (`POST <fake>/_fake/users/elif@acme.example/suspend`), then choose "Scan now": the line shows "Scanning…" and the button is disabled; when the scan ends, the line shows the new time without a reload, and People shows Elif suspended.
- [ ] Double-clicking "Scan now" starts one scan only.
- [ ] With the fake failing the directory (`POST <fake>/_fake/failures` for `directory.users.list` with `app_unavailable`, count 3), "Scan now" ends with "The last scan failed. Try Scan now again." under the previous scan's time.

## Change Google app

- [ ] "Change Google app" opens `/settings/connections/google-app` titled "Change Google app", with both app choices; choosing your own app reveals the redirect address, Google Cloud steps and credential fields; "Connections" stays highlighted in the menu.
- [ ] Register a second client in the fake (`POST <fake>/_fake/clients` with a client ID, secret and the redirect address), enter it and choose "Connect as Google admin": the fake's consent page names the new client; allowing as `admin@acme.example` returns to Connections, and People is unchanged.
- [ ] Choosing Cancel at Google returns to the change page with "You cancelled at Google. The Google app hasn’t changed."
- [ ] Consenting as a user who is not a super admin returns with "That Google account isn’t a super admin. Sign in with a super admin account."
- [ ] After a change, signing out and "Sign in with Google" asks Google with the new client and lands signed in.

## Integration user

Start without an integration user (`pnpm dev --drop-db`, then setup again).

- [ ] The Google Workspace card shows "Reads only" beside "Connected".
- [ ] "Integration user" heads a green card between "Directory" and "Apps": "Give Broccoli Access its own user", "An integration user is a separate Google Workspace account, such as broccoli@acme.example, that Broccoli Access signs in to your apps with. It creates, changes and removes accounts as this user, not with your own session.", three points ("If an app blocks automation, it blocks this user, not you.", "Keeps working when you are signed out or away.", "Suspend it in Google to stop everything at once.") and "Create integration user".
- [ ] "Create integration user" opens the dialog "Create the integration user": "Its email address" holds "broccoli" before a fixed "@acme.example", with "Google will ask you to allow creating users. This uses one paid Google seat.", "Cancel" and "Continue to Google"; Escape and "Cancel" close it.
- [ ] At 390 px wide, "Create integration user" wraps under the card's text, and its dialog fits the screen without scrolling sideways.
- [ ] After "Continue to Google", the browser's Back returns to Connections with the dialog usable again: "Cancel" closes it and "Continue to Google" works.
- [ ] An address such as "bro ccoli" shows "Use letters and digits, with single dots, hyphens or underscores between them." under the field and stays in the dialog.
- [ ] "Continue to Google" opens the fake's consent page, which lists only "See, create and change users in your organisation", also after another account allowed it. Cancel there returns to Connections with "You cancelled at Google. No integration user was created." in the card, and the Google Workspace card still shows "Reads only".
- [ ] After `POST <fake>/_fake/consent/refuse-scope` with `{"scope":"https://www.googleapis.com/auth/admin.directory.user"}`, Allow returns with "Google didn’t get your permission to create users, so no integration user was created. Try again and allow it."
- [ ] With the address "ana", Allow returns with "That address is already used in your Google Workspace. Pick another one."
- [ ] Choosing Chloé Martin on the consent page returns with "That Google account isn’t a super admin. Sign in with a super admin account."
- [ ] With "broccoli", Allow as Mia Novak returns to Connections: the card shows "broccoli@acme.example" with "Created", "Signed in to Google · Two-step sign-in on" and "Open in Google admin", which opens `https://admin.google.com` in a new tab; the Google Workspace card shows "Can create and change users"; and `GET <fake>/_fake/state` lists `broccoli@acme.example` under `createdUsers`, with no password.
      Each of the next three checks creates the integration user again, so start each without one (`pnpm dev --drop-db`, then setup again).

- [ ] With the fake connectors slowed (`POST <fake connectors>/_fake/delay` with `{"milliseconds": 5000}`) before Allow, the card first shows "Setting up" with "Broccoli Access is signing in to Google as this user and setting up its two-step sign-in.", then turns to "Created" by itself. Set the delay back to 250.
- [ ] With `POST <fake connectors>/_fake/failures` and `{"call": "integration-user/setup", "code": "blocked_by_check", "count": 1}` before Allow, the card turns amber with "Needs you", "Google showed a check that needs a person, so Broccoli Access stopped signing in. It never gets around a check. Try again later." and "Try again"; a reload keeps it. "Try again" turns the card to "Created" with "Signed in to Google · Two-step sign-in on".
- [ ] The same with the code `authentication_failed` shows "Google refused this user’s password or two-step code. Check in Google admin that the user is active, then try again.", and with `app_unavailable` "Broccoli Access couldn’t sign in through the connectors container. Check that it is set up and running, then try again."
- [ ] After a restart of `pnpm dev`, without dropping the database, while the card shows "Needs you", it reads "Broccoli Access couldn’t finish signing in to Google as this user. Try again."; the fakes forget the user on a restart, so "Try again" then shows the refused sign-in.
- [ ] Connected with the Broccoli Google app, the card shows "Creating it needs your own Google app. Change the Google app above first." and no "Create integration user".
- [ ] After "Scan now", People does not list `broccoli@acme.example`, and its count is unchanged.

## Apps

- [ ] Slack reads "Not connected" and "Slack has no API for this on your plan, so Broccoli Access makes the calls Slack’s own admin pages make, with a Slack session: the integration user’s, or your own.", with "Connect Slack".
- [ ] Linear reads "Not connected", "Through Linear’s API, with a personal API key made by a Linear admin." and "Connect Linear".
- [ ] "Connect Linear" opens a dialog "Connect Linear" reading "Broccoli Access reads your Linear members and disables or enables them when you ask, through Linear’s API.", a "Personal API key" field with "In Linear, signed in as an admin, open Settings → Security & access, click New API key under Personal API keys, give it full access and paste it here. Broccoli Access stores it encrypted on your server.", "Cancel" and "Connect Linear"; Escape and "Cancel" close it.
- [ ] Connecting with an empty field shows "Enter the personal API key." under it; any key other than `lin_api_acme_fake` shows "Linear refused it. Check it and try again." and Linear stays not connected.
- [ ] With the fake failing the test (`POST <fake connectors>/_fake/failures` for `linear`, `connections/test`, `app_unavailable`, count 3), connecting with `lin_api_acme_fake` shows "Couldn’t check the connection to Linear. Try again." and Linear stays not connected; with count 1, connecting succeeds on the next attempt.
- [ ] `lin_api_acme_fake` closes the dialog; the card reads "Connected", "The Acme workspace, connected with a personal API key of admin@acme.example." and, once its scan ends, "7 members. Scanned today at HH:MM.", with "Scan now" and "Change key".
- [ ] Linear shows in Applications under Approved with 7 users, found via "Linear members", "1 still has access".
- [ ] With the fake failing the list (`accounts/list`, `app_unavailable`, count 3), Linear's "Scan now" ends with "The last scan failed. Try Scan now again."
- [ ] With `CONNECTORS_URL: ""` on `broccoli-access` in `docker-compose.yml` (blank counts as unset), Connections shows no "Apps" section.

## Connect Slack with the integration user

Start with Slack not connected, no integration user, and a Chrome without the extension. Set `FAKE` to the fake connectors' address and `SLACK` to the owner's session, as "The fake connectors container" in `docs/testing.md` says.

- [ ] "Connect Slack" opens "Connect Slack" with a green card "Integration user", "Recommended", "You have none yet. Create it once, for all apps." and "Create integration user", which closes the dialog on Connections; and a card "My own session", "Needs the Chrome extension.", whose "Continue" opens the steps of "Connect Slack with your own session" below.
- [ ] With the integration user created, "Connect Slack" offers "Integration user", selected, with "In Slack, invite **broccoli@acme.example** as an admin. Then press Connect.", and "My own session"; Cancel closes it.
- [ ] Connect shows "Before you connect Slack" with Slack's notice; "Accept and continue" stays disabled until "I’ve read this and choose to connect Slack." is ticked.
- [ ] Before any invitation, "Accept and continue" shows "Connecting Slack" with "The integration user has no invitation in Slack. Invite it as an admin in Slack, then try again." and "Try again"; Slack stays "Not connected".
- [ ] After the invite of `docs/testing.md` without its `role`, "Try again" shows "The integration user isn’t an admin in Slack. Make it an admin in Slack, then try again."
- [ ] With the fake failing the sign-in (`POST $FAKE/_fake/failures` for `slack`, `connections/sign-in`, `blocked_by_check`, count 1), "Try again" shows "Google or Slack showed a check, which Broccoli Access never gets around. Try again later, or connect with your own session."
- [ ] After `curl -s -H 'content-type: application/json' -d '{"role": "admin"}' "$FAKE/_fake/slack/members/broccoli@acme.example/role"` and a delay of 4000 ms (`POST $FAKE/_fake/delay`), "Try again" lists "Accept the invitation" and "Sign in to Slack" as "Working" and "Read the members" as "Next", with "You can close this. Slack shows as connected when it is done."; then the first two read "Done" and the third "Working", then "Done" with "Slack is connected."
- [ ] Closed while it works, the dialog reopens on the same steps, and the card turns "Connected" by itself.
- [ ] The card reads "Connected", "Acts as the integration user", "The Acme workspace, connected with the Slack session of broccoli@acme.example." and, once scanned, "45 members.", with "Scan now" and no "Switch"; "Broccoli Access for Chrome" still reads "Not installed".
- [ ] Slack's app page shows "Acts as the integration user" beside "Connected". After Disable on Ana there, `curl -s "$FAKE/_fake/state"` lists under `changes.slack` a `suspend` of `ana@acme.example` with `madeBy` `broccoli@acme.example`.
- [ ] At 390 px wide, the dialog fits the screen in each of these states without scrolling sideways.

## Connect Slack with your own session

Start with the owner unpaired (Unpair in Settings) and a Chrome profile without the extension: the first checks download it and load it unpacked. "The Chrome extension" in `docs/testing.md` says how to run Chrome with an extension and answer its prompts.

- [ ] Without the extension, "Connect Slack", then "My own session" and Connect (or "Continue" while no integration user signs in), opens on step 1, "Add the Broccoli Access extension to Chrome", with "Download the extension", five numbered steps, the note for a company-managed Chrome with the extension's ID, "Waiting for the extension. This moves on by itself once it’s installed." and "Works in Chrome only."
- [ ] Before installing, the Chrome extension card reads "Not installed" with the same download and steps. At a plain http address other than this computer's (such as `http://app.localhost:<port>`, signed in again there), both places say to open Broccoli Access at its https address instead of offering the download.
- [ ] By keyboard alone, each Copy button (`chrome://extensions` and the ID) copies its text and reads "Copied" for a moment; Tab also reaches each value, which selects itself.
- [ ] "Download the extension" downloads `broccoli-access-extension.zip`; unzipped and loaded unpacked as the steps say, the dialog moves on to step 2 without a reload.
- [ ] With the extension installed, the card offers "Download the extension" again under "It doesn’t update itself…".
- [ ] Open the extension popup before and after pairing. Both states explain that “Hand over” shares cookies from the listed domains and their subdomains plus any requested browser storage values and say Broccoli Access uses the session to manage user accounts.
- [ ] With the extension not paired, it opens on step 2 "Pair the extension with Broccoli Access", Extension ticked, naming this address and "Installed in Chrome on <platform>. Not paired yet."; "Pair this Chrome" pairs as the Chrome extension card does, and the dialog moves on by itself.
- [ ] Paired, it opens on step 3 "Before you connect Slack" with Slack's notice; "Accept and continue" stays disabled until "I’ve read this and choose to connect Slack." is ticked.
- [ ] Step 4 "Sign in to Slack in Chrome, then Connect" lists what the extension sends, with "Open Slack in a new tab ↗" to `https://slack.com`.
- [ ] Without a fake Slack tab open, "Connect Slack" opens the extension's window "Hand over your Slack session to <address>?" listing `slack.localhost`. The first "Hand over" in the profile asks Chrome for access to "all slack.localhost sites"; once allowed, it says "Open Slack in a tab of this Chrome and sign in, then hand over again.", and later attempts ask Chrome nothing.
- [ ] After `POST <fake connectors>/_fake/slack/sessions/expire`, with the old tab still open, "Hand over" says "Slack didn't accept this session. Check that you're signed in to Slack as an admin, then hand over again."
- [ ] Cancel in the extension's window leaves the dialog with "Nothing was handed over. Connect Slack again when you’re ready."
- [ ] Signed in at the fake Slack, "Hand over" closes the window, and the dialog shows "Connect the Acme workspace?" with Acme and `acme.slack.com`; Back returns to step 4.
- [ ] In a profile without the extension, while this owner is paired in another Chrome, "Connect Slack" still opens on step 1; with the extension installed but not paired there, the extension's window says "This Chrome isn't paired…", and after closing it the dialog offers "Pair this Chrome".
- [ ] "Connect Acme" closes the dialog; the card reads "Connected", "Uses your own session", "The Acme workspace, connected with the Slack session of admin@acme.example." and, once scanned, "41 members. Scanned today at HH:MM. You accepted Slack’s notice on <today>."
- [ ] Slack's app page lists 41 users with their "In Slack" status, Elif "Disabled".
- [ ] With the integration user created and invited to Slack as an admin, the card's "Switch" opens "Switch Slack to the integration user" with only "Integration user" and "Then press Switch."; Switch shows the three steps with no notice, and the card then reads "Acts as the integration user", "connected with the Slack session of broccoli@acme.example" once scanned, and has no "Switch".
- [ ] At 390 px wide, every step fits without horizontal scrolling.

## Reconnect

With Slack and Linear connected as above, and `FAKE` set to the fake connectors' address.

- [ ] After `curl -s -X POST "$FAKE/_fake/slack/sessions/expire"`, Slack's "Scan now" turns its card amber with "Reconnect", "Your Slack session expired or was signed out. Found by a scan today at HH:MM.", "Changes in Slack fail until you reconnect.", "Sign in to Slack in Chrome, then Reconnect." and "Reconnect" in place of "Scan now".
- [ ] "Reconnect" opens the extension's window and reads "Click Hand over in the extension’s window."; Cancel there ends with "Nothing was handed over. Reconnect Slack when you’re ready." and Slack stays in Reconnect.
- [ ] Signed in again at the fake Slack in a tab, "Reconnect" then "Hand over" closes the window, a toast says "Slack is reconnected.", and the card is "Connected" again with "Scan now".
- [ ] After `curl -s -X POST "$FAKE/_fake/linear/keys/revoke"`, disabling Chloé on Linear's page turns Linear's card to "Reconnect" with "Linear refused the API key: it was revoked or expired. Found when you disabled Chloé Martin today at HH:MM.", "Changes in Linear fail until you paste a new key." and "Paste a new key".
- [ ] "Paste a new key" opens "Paste a new key for Linear" with "Check and save"; another key shows "Linear refused it. Check it and try again." and Linear stays in Reconnect. After `curl -s -X POST "$FAKE/_fake/reset"`, `lin_api_acme_fake` closes the dialog and the card is "Connected" with "Scan now" and "Change key".
- [ ] A Google Workspace scan that fails (fake Google `POST /_fake/tokens/revoke`, then "Scan now") shows "Reconnect" and offers consent through Change Google app. The current app is selected; after consent, Scan now clears the failure without a reload.
- [ ] At 390 px wide, a card in Reconnect wraps its button under the text without horizontal scrolling.

## Shared Google app

- [ ] Switch own app → Broccoli app → own app. Connection ID, owner, people and approved apps stay; a cancelled or refused change leaves the old app working.
- [ ] After each switch, Scan now excludes grants to both current and previous Google apps.
- [ ] A revoked shared refresh token shows Reconnect. Consent again through Change Google app, then Scan now succeeds.
- [ ] A relay outage fails the scan and permits a retry; it does not show Reconnect.
