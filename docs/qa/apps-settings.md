# QA for Apps settings

Check app connections and the Chrome extension in Settings → Apps.

## Setup

1. Start the stack, connect Google Workspace as `admin@acme.example` and move setup on as in [QA setup](setup.md).
2. Use the browser that connected Google Workspace. Note the fake Google's and the fake connectors' addresses that `pnpm dev` prints; their controls are under `/_fake` (see `docs/fake-apps.md` and "The fake connectors container" in `docs/testing.md`).

## Apps page

- [ ] Settings → Apps opens `/settings/apps` with the title "Apps" and "Connect apps to see their members and manage access where supported."
- [ ] There is a card for Slack and one for Linear, with the Chrome extension card below them.

## Apps

- [ ] Slack reads "Not connected" and "Slack has no API for this on your plan, so Broccoli Access makes the calls Slack’s own admin pages make, with a Slack session: the integration user’s, or your own.", with "Connect Slack".
- [ ] Linear reads "Not connected", "Through Linear’s API, with a personal API key made by a Linear admin." and "Connect Linear".
- [ ] "Connect Linear" opens a dialog "Connect Linear" reading "Broccoli Access reads your Linear members and disables or enables them when you ask, through Linear’s API.", a "Personal API key" field with "In Linear, signed in as an admin, open Settings → Security & access, click New API key under Personal API keys, give it full access and paste it here. Broccoli Access stores it encrypted on your server.", "Cancel" and "Connect Linear"; Escape and "Cancel" close it.
- [ ] Connecting with an empty field shows "Enter the personal API key." under it; any key other than `lin_api_acme_fake` shows "Linear refused it. Check it and try again." and Linear stays not connected.
- [ ] With the fake failing the test (`POST <fake connectors>/_fake/failures` for `linear`, `connections/test`, `app_unavailable`, count 3), connecting with `lin_api_acme_fake` shows "Couldn’t check the connection to Linear. Try again." and Linear stays not connected; with count 1, connecting succeeds on the next attempt.
- [ ] `lin_api_acme_fake` closes the dialog; the card reads "Connected", "The Acme workspace, connected with a personal API key of admin@acme.example." and, once its scan ends, "7 members. Scanned today at HH:MM.", with "Scan now" and "Change key".
- [ ] Linear shows in Applications under Approved with 7 users, found via "Linear members", "1 still has access".
- [ ] With the fake failing the list (`accounts/list`, `app_unavailable`, count 3), Linear's "Scan now" ends with "The last scan failed. Try Scan now again."
- [ ] With `CONNECTORS_URL: ""` on `broccoli-access` in `docker-compose.yml` (blank counts as unset), the Apps page shows the Chrome extension card without connector cards.

## Connect Slack with the integration user

Start with Slack not connected, no integration user, and a Chrome without the extension. Set `FAKE` to the fake connectors' address and `SLACK` to the owner's session, as "The fake connectors container" in `docs/testing.md` says.

- [ ] "Connect Slack" opens "Connect Slack" with a green card "Integration user", "Recommended", "You have none yet. Create it once, for all apps." and "Create integration user", which closes the dialog and opens Settings → Google Workspace; and a card "My own session", "Needs the Chrome extension.", whose "Continue" opens the steps of "Connect Slack with your own session" below.
- [ ] [Create the integration user](google-workspace-settings.md#integration-user), return to Apps and reopen "Connect Slack". The dialog offers "Integration user", selected, with "In Slack, invite **broccoli@acme.example** as an admin. Then press Connect.", and "My own session"; Cancel closes it.
- [ ] Connect shows "Before you connect Slack" with Slack's notice; "Accept and continue" stays disabled until "I’ve read this and choose to connect Slack." is ticked.
- [ ] Before any invitation, "Accept and continue" shows "Connecting Slack" with only "The integration user has no invitation in Slack. Invite it as an admin in Slack, then try again." and "Try again", no steps; Slack stays "Not connected".
- [ ] After the invite of `docs/testing.md` without its `role`, "Try again" shows "The integration user isn’t an admin in Slack. Make it an admin in Slack, then try again."
- [ ] With the fake failing the sign-in (`POST $FAKE/_fake/failures` for `slack`, `connections/sign-in`, `blocked_by_check`, count 1), "Try again" shows "Google or Slack showed a check, which Broccoli Access never gets around. Try again later."
- [ ] After `curl -s -H 'content-type: application/json' -d '{"role": "admin"}' "$FAKE/_fake/slack/members/broccoli@acme.example/role"` and a delay of 4000 ms (`POST $FAKE/_fake/delay`), "Try again" lists "Accept the invitation" and "Sign in to Slack" as "Working" and "Read the members" as "Next", with "You can close this. Slack shows as connected when it is done."
- [ ] Signed in, the dialog asks "Connect the Acme workspace?" with "The integration user signed in to this Slack workspace. Nothing is connected until you confirm it.", Acme and `acme.slack.com`; Slack still reads "Not connected". Cancel closes it and Slack stays "Not connected"; so does waiting more than five minutes, after which "Connect Acme" says "This hand-over expired. Connect Slack again."
- [ ] "Connect Acme" shows the steps again with the first two "Done" and "Read the members" "Working", then "Done" with "Slack is connected."
- [ ] Closed while it works, the dialog reopens on the same steps, and the card turns "Connected" by itself. Closed while a sign-in that fails works, it reopens on the reason with "Try again".
- [ ] With the fake failing the list (`accounts/list`, `app_unavailable`, count 3) before Connect, the last step reads "Failed" with "Slack is connected, but its members couldn’t be read. Close this and look at Slack in Settings › Apps."
- [ ] The card reads "Connected", "Acts as the integration user", "The Acme workspace, connected with the integration user’s Slack session." and, once scanned, "45 members.", with "Scan now" and no "Switch"; "Broccoli Access for Chrome" still reads "Not installed".
- [ ] Slack's app page shows "Acts as the integration user" beside "Connected". After Disable on Ana there, `curl -s "$FAKE/_fake/state"` lists under `changes.slack` a `suspend` of `ana@acme.example` with `madeBy` `broccoli@acme.example`.
- [ ] At 390 px wide, the dialog fits the screen in each of these states without scrolling sideways.

## Connect Slack with your own session

Start with Slack not connected (`pnpm dev --drop-db`, then setup again), the owner unpaired (Unpair in Settings) and a Chrome profile without the extension: the first checks download it and load it unpacked. "The Chrome extension" in `docs/testing.md` says how to run Chrome with an extension and answer its prompts.

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
- [ ] With the integration user created and invited to Slack as an admin, the card's "Switch" opens "Switch Slack to the integration user" with only "Integration user" and "In the connected Slack workspace, invite **broccoli@acme.example** as an admin. Then press Switch."; while Slack's scan runs, Switch ends with "Slack is being scanned. Try again when the scan ends."; Switch shows the three steps with no notice, and the card then reads "Acts as the integration user", "connected with the integration user’s Slack session", and has no "Switch". The dialog is titled "Switching Slack to the integration user" and ends with "Slack now acts as the integration user."
- [ ] At 390 px wide, every step fits without horizontal scrolling.

## Reconnect

With Slack and Linear connected as above, and `FAKE` set to the fake connectors' address.

- [ ] After `curl -s -X POST "$FAKE/_fake/slack/sessions/expire"`, Slack's "Scan now" turns its card amber with "Reconnect", "Your Slack session expired or was signed out. Found by a scan today at HH:MM.", "Changes in Slack fail until you reconnect.", "Sign in to Slack in Chrome, then Reconnect." and "Reconnect" in place of "Scan now".
- [ ] "Reconnect" opens the extension's window and reads "Click Hand over in the extension’s window."; Cancel there ends with "Nothing was handed over. Reconnect Slack when you’re ready." and Slack stays in Reconnect.
- [ ] Signed in again at the fake Slack in a tab, "Reconnect" then "Hand over" closes the window, a toast says "Slack is reconnected.", and the card is "Connected" again with "Scan now".
- [ ] After `curl -s -X POST "$FAKE/_fake/linear/keys/revoke"`, disabling Chloé on Linear's page turns Linear's card to "Reconnect" with "Linear refused the API key: it was revoked or expired. Found when you disabled Chloé Martin today at HH:MM.", "Changes in Linear fail until you paste a new key." and "Paste a new key".
- [ ] "Paste a new key" opens "Paste a new key for Linear" with "Check and save"; another key shows "Linear refused it. Check it and try again." and Linear stays in Reconnect. After `curl -s -X POST "$FAKE/_fake/reset"`, `lin_api_acme_fake` closes the dialog and the card is "Connected" with "Scan now" and "Change key".
- [ ] At 390 px wide, a card in Reconnect wraps its button under the text without horizontal scrolling.

## Reconnect as the integration user

With Slack connected as the integration user (see above), `FAKE` set to the fake connectors' address and `GOOGLE` to the fake Google's.

- [ ] After `curl -s -X POST "$FAKE/_fake/slack/sessions/expire"`, Slack's "Scan now" ends with "Connected" and no "Reconnect": the scan signs in again by itself and the card still reads "Acts as the integration user".
- [ ] After the same expiry and `curl -s -X POST -H 'content-type: application/json' -d '{"connector":"slack","call":"connections/sign-in","code":"blocked_by_check","count":1}' "$FAKE/_fake/failures"`, "Scan now" turns the card amber with "Reconnect", "A check, such as a CAPTCHA, stopped Broccoli Access from signing in to Slack as the integration user. Only a person can pass it. Found by a scan today at HH:MM." and "Changes in Slack fail until the integration user signs in again.", never "Your Slack session expired".
- [ ] The same with the code `permission_missing` reads "The integration user is no longer an admin in Slack. If it is not a member, invite it as an admin."
- [ ] The card's button reads "Sign in again as the integration user", never "Reconnect" with a hand-over window; pressing it brings back "Connected" and "Acts as the integration user", not the owner's session.
- [ ] After `curl -s -X POST "$GOOGLE/_fake/users/broccoli@acme.example/suspend"` and "Scan now" on Google Workspace, open Settings → Apps. Without a Slack scan or a reload, Slack's card reads "Reconnect" with "Slack stopped: the integration user is suspended in Google. Found by a scan today at HH:MM." and "Restore the integration user in Google, then sign in again."; a reload keeps it, and the fake's Slack records no call.
- [ ] After `.../unsuspend` and "Scan now" on Google Workspace, return to Apps. The card is "Connected" again, and its "Scan now" works.
- [ ] A Slack connected with your own session keeps the old "Reconnect" above after the expiry, and the suspension changes nothing in it.
