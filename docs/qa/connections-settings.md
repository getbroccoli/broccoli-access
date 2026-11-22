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

- [ ] Slack reads "Not connected" and "Broccoli Access makes the calls Slack’s own admin pages make, with your Slack session. The Chrome extension hands it over.", with no button.
- [ ] Linear reads "Not connected", "Through Linear’s API. Paste a personal API key made by a Linear admin." and "Connect Linear".
- [ ] "Connect Linear" opens a dialog "Connect Linear" with a "Linear API key" field, its hint ending "Broccoli Access stores it encrypted on your server.", "What happens next", "Cancel" and "Connect Linear"; Escape and "Cancel" close it.
- [ ] Connecting with an empty field shows "Enter the Linear API key." under it; any key other than `lin_api_acme_fake` shows "Linear refused it. Check it and try again." and Linear stays not connected.
- [ ] With the fake failing the test (`POST <fake connectors>/_fake/failures` for `linear`, `connections/test`, `app_unavailable`, count 3), connecting with `lin_api_acme_fake` shows "Couldn’t check the connection to Linear. Try again." and Linear stays not connected; with count 1, connecting succeeds on the next attempt.
- [ ] `lin_api_acme_fake` closes the dialog; the card reads "Connected", "The Acme workspace, connected with the Linear API key of admin@acme.example." and, once its scan ends, "7 members. Scanned today at HH:MM.", with "Scan now".
- [ ] Linear shows in Applications under Approved with 7 users, found via "Linear members", "1 still has access".
- [ ] With the fake failing the list (`accounts/list`, `app_unavailable`, count 3), Linear's "Scan now" ends with "The last scan failed. Try Scan now again."
- [ ] Without `CONNECTORS_URL` (the self-hosted image as built), Connections shows no "Apps" section.
