# QA: Connections settings

A manual check of Settings → Connections against a development stack: the Google Workspace card, "Scan now", "Change Google app" and the apps the connectors container connects.

## Setup

1. Start the stack, connect Google Workspace as `admin@acme.example` and move setup on as in [QA setup](setup.md).
2. Use the browser that connected Google Workspace. Note the fake Google's and the fake connectors' addresses that `pnpm dev` prints; their controls are under `/_fake` (see `docs/fake-apps.md` and "The fake connectors container" in `docs/testing.md`).

## Connections page

- [ ] Settings opens on "Connections", first in the settings menu, with "Where Broccoli Access finds your people and their accounts." under the title.
- [ ] "Directory" heads the Google Workspace card; "Apps", with "Connect an app to see its members, and disable or enable their accounts from here.", heads a card for Slack and one for Linear below it.
- [ ] The card shows "Google Workspace" with "Connected", "acme.example, connected as admin@acme.example with your own Google app." and "Scanned today at HH:MM." with the time of the last scan in the browser's time zone.
- [ ] "Scan now" and "Change Google app" sit at the card's right; at 390 px wide they wrap under the text.

## Scan now

- [ ] Suspend `elif@acme.example` in the fake Google (`POST <fake>/_fake/users/elif@acme.example/suspend`), then choose "Scan now": the line shows "Scanning…" and the button is disabled; when the scan ends, the line shows the new time without a reload, and People shows Elif suspended.
- [ ] Double-clicking "Scan now" starts one scan only.
- [ ] With the fake failing the directory (`POST <fake>/_fake/failures` for `directory.users.list` with `app_unavailable`, count 3), "Scan now" ends with "The last scan failed. Try Scan now again." under the previous scan's time.

## Change Google app

- [ ] "Change Google app" opens `/settings/connections/google-app` titled "Change Google app", with the redirect address, the Google Cloud steps and the client ID and secret fields; "Connections" stays highlighted in the menu.
- [ ] Register a second client in the fake (`POST <fake>/_fake/clients` with a client ID, secret and the redirect address), enter it and choose "Connect as Google admin": the fake's consent page names the new client; allowing as `admin@acme.example` returns to Connections, and People is unchanged.
- [ ] Choosing Cancel at Google returns to the change page with "You cancelled at Google. The Google app hasn’t changed."
- [ ] Consenting as a user who is not a super admin returns with "That Google account isn’t a super admin. Sign in with a super admin account."
- [ ] After a change, signing out and "Sign in with Google" asks Google with the new client and lands signed in.

## Apps

- [ ] Slack reads "Not connected" and "Slack has no API for this on your plan, so Broccoli Access makes the calls Slack’s own admin pages make, with your Slack session. The Chrome extension hands it over.", with "Connect Slack".
- [ ] Linear reads "Not connected", "Through Linear’s API, with a personal API key made by a Linear admin." and "Connect Linear".
- [ ] "Connect Linear" opens a dialog "Connect Linear" reading "Broccoli Access reads your Linear members and disables or enables them when you ask, through Linear’s API.", a "Personal API key" field with "In Linear, signed in as an admin, open Settings → Account → Security & access, create a personal API key with full access and paste it here. Broccoli Access stores it encrypted on your server.", "Cancel" and "Connect Linear"; Escape and "Cancel" close it.
- [ ] Connecting with an empty field shows "Enter the personal API key." under it; any key other than `lin_api_acme_fake` shows "Linear refused it. Check it and try again." and Linear stays not connected.
- [ ] With the fake failing the test (`POST <fake connectors>/_fake/failures` for `linear`, `connections/test`, `app_unavailable`, count 3), connecting with `lin_api_acme_fake` shows "Couldn’t check the connection to Linear. Try again." and Linear stays not connected; with count 1, connecting succeeds on the next attempt.
- [ ] `lin_api_acme_fake` closes the dialog; the card reads "Connected", "The Acme workspace, connected with a personal API key of admin@acme.example." and, once its scan ends, "7 members. Scanned today at HH:MM.", with "Scan now" and "Change key".
- [ ] Linear shows in Applications under Approved with 7 users, found via "Linear members", "1 still has access".
- [ ] With the fake failing the list (`accounts/list`, `app_unavailable`, count 3), Linear's "Scan now" ends with "The last scan failed. Try Scan now again."
- [ ] With `CONNECTORS_URL: ""` on `broccoli-access` in `docker-compose.yml` (blank counts as unset), Connections shows no "Apps" section.

## Connect Slack

Start with the owner unpaired (Unpair in Settings) and a Chrome profile without the extension: the first checks download it and load it unpacked. "The Chrome extension" in `docs/testing.md` says how to run Chrome with an extension and answer its prompts.

- [ ] Without the extension, "Connect Slack" opens on step 1, "Add the Broccoli Access extension to Chrome", with "Download the extension", five numbered steps, the note for a company-managed Chrome with the extension's ID, "Waiting for the extension. This moves on by itself once it’s installed." and "Works in Chrome only."
- [ ] Before installing, the Chrome extension card reads "Not installed" with the same download and steps. At a plain http address other than this computer's (such as `http://app.localhost:<port>`, signed in again there), both places say to open Broccoli Access at its https address instead of offering the download.
- [ ] By keyboard alone, each Copy button (`chrome://extensions` and the ID) copies its text and reads "Copied" for a moment; Tab also reaches each value, which selects itself.
- [ ] "Download the extension" downloads `broccoli-access-extension.zip`; unzipped and loaded unpacked as the steps say, the dialog moves on to step 2 without a reload.
- [ ] With the extension installed, the card offers "Download the extension" again under "It doesn’t update itself…".
- [ ] With the extension not paired, it opens on step 2 "Pair the extension with Broccoli Access", Extension ticked, naming this address and "Installed in Chrome on <platform>. Not paired yet."; "Pair this Chrome" pairs as the Chrome extension card does, and the dialog moves on by itself.
- [ ] Paired, it opens on step 3 "Before you connect Slack" with Slack's notice; "Accept and continue" stays disabled until "I’ve read this and choose to connect Slack." is ticked.
- [ ] Step 4 "Sign in to Slack in Chrome, then Connect" lists what the extension sends, with "Open Slack in a new tab ↗" to `https://slack.com`.
- [ ] Without a fake Slack tab open, "Connect Slack" opens the extension's window "Hand over your Slack session to <address>?" listing `slack.localhost`. The first "Hand over" in the profile asks Chrome for access to "all slack.localhost sites"; once allowed, it says "Open Slack in a tab of this Chrome and sign in, then hand over again.", and later attempts ask Chrome nothing.
- [ ] After `POST <fake connectors>/_fake/slack/sessions/expire`, with the old tab still open, "Hand over" says "Slack didn't accept this session. Check that you're signed in to Slack as an admin, then hand over again."
- [ ] Cancel in the extension's window leaves the dialog with "Nothing was handed over. Connect Slack again when you’re ready."
- [ ] Signed in at the fake Slack, "Hand over" closes the window, and the dialog shows "Connect the Acme workspace?" with Acme and `acme.slack.com`; Back returns to step 4.
- [ ] In a profile without the extension, while this owner is paired in another Chrome, "Connect Slack" still opens on step 1; with the extension installed but not paired there, the extension's window says "This Chrome isn't paired…", and after closing it the dialog offers "Pair this Chrome".
- [ ] "Connect Acme" closes the dialog; the card reads "Connected", "The Acme workspace, connected with the Slack session of admin@acme.example." and, once scanned, "41 members. Scanned today at HH:MM. You accepted Slack’s notice on <today>."
- [ ] Slack's app page lists 41 users with their "In Slack" status, Elif "Disabled".
- [ ] At 390 px wide, every step fits without horizontal scrolling.

## Reconnect

With Slack and Linear connected as above, and `FAKE` set to the fake connectors' address.

- [ ] After `curl -s -X POST "$FAKE/_fake/slack/sessions/expire"`, Slack's "Scan now" turns its card amber with "Reconnect", "Your Slack session expired or was signed out. Found by a scan today at HH:MM.", "Changes in Slack fail until you reconnect.", "Sign in to Slack in Chrome, then Reconnect." and "Reconnect" in place of "Scan now".
- [ ] "Reconnect" opens the extension's window and reads "Click Hand over in the extension’s window."; Cancel there ends with "Nothing was handed over. Reconnect Slack when you’re ready." and Slack stays in Reconnect.
- [ ] Signed in again at the fake Slack in a tab, "Reconnect" then "Hand over" closes the window, a toast says "Slack is reconnected.", and the card is "Connected" again with "Scan now".
- [ ] After `curl -s -X POST "$FAKE/_fake/linear/keys/revoke"`, disabling Chloé on Linear's page turns Linear's card to "Reconnect" with "Linear refused the API key: it was revoked or expired. Found when you disabled Chloé Martin today at HH:MM.", "Changes in Linear fail until you paste a new key." and "Paste a new key".
- [ ] "Paste a new key" opens "Paste a new key for Linear" with "Check and save"; another key shows "Linear refused it. Check it and try again." and Linear stays in Reconnect. After `curl -s -X POST "$FAKE/_fake/reset"`, `lin_api_acme_fake` closes the dialog and the card is "Connected" with "Scan now" and "Change key".
- [ ] A Google Workspace scan that fails (fake Google `POST /_fake/tokens/revoke`, then "Scan now") shows "The last scan failed. Try Scan now again." and keeps "Connected".
- [ ] At 390 px wide, a card in Reconnect wraps its button under the text without horizontal scrolling.
