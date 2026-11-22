# QA: App page

A manual check of an app's page, `/apps/<id>`, against a development stack.

## Setup

1. Start the stack with `pnpm dev --drop-db`, connect Google Workspace and finish setup with the six preselected apps, as in [QA setup](setup.md).
2. Use the browser that finished setup, and open Figma from Applications.

## Figma

- [ ] The page shows "‹ Applications", which leads back to Applications, Figma's logo, "Figma" with an "Approved" badge, "figma.com" below and "Ignore" on the right.
- [ ] The cards read "Users 16" and, tinted amber, "Suspended in Google, still has access 1".
- [ ] Under "Users", the table lists Person (initials, name, email), Status, Found via and Since.
- [ ] The first row is Ana Ruiz, `ana@acme.example`, "Suspended in Google", "Google sign-in", "Before <date>" about six months before the scan; the others read "Active" and follow by first name.
- [ ] Eight users show, then "Show 8 more", which shows the other eight.

## Actions

- [ ] "Ignore" opens a dialog "Ignore Figma?" reading "It moves to Ignored. You can approve it again at any time." with "Cancel" and "Ignore app"; focus starts on "Cancel" and Tab stays in the dialog.
- [ ] "Cancel", Escape and a click outside the dialog leave Figma approved.
- [ ] "Ignore app" changes the badge to "Ignored" and the button to "Approve" without a reload; Applications then reads "Approved 6" and "Ignored 32".
- [ ] "Approve" brings Figma back: the badge reads "Approved" and the tabs "Approved 7" and "Ignored 31".
- [ ] Ignoring Slack on its page lowers the left menu's People badge from 2 to 1 without a reload, since Ben's only approved app was Slack; "Approve" puts it back to 2.
- [ ] A Discovered app's page has both "Approve" and "Ignore"; approving it removes the left menu's Discovered badge when it was the last one.
- [ ] Google Workspace's page has no action button, and its amber card reads 0 without the tint.

## An app to connect

Open Slack from Applications.

- [ ] After "Approved", an outlined "Can disable" pill with a person-minus icon reads "Broccoli Access can disable and enable accounts in this app" on hover.
- [ ] Next to "Ignore", "Connect Slack" opens Settings → Connections.
- [ ] Under the header, a grey note reads "Connect Slack to see every member and disable or enable their accounts from here. Until then, Broccoli Access sees only who signs in to Slack with Google."
- [ ] Figma's and Google Workspace's pages have none of the three.

## A connected app

Connect Linear in Settings → Connections as in [Connections settings](connections-settings.md#apps), then open Linear from Applications.

- [ ] The header reads "Linear" with "Approved", "Can disable" and "Connected", "linear.app · the Acme workspace. Scanned today at HH:MM." below, and "Open Linear admin ↗" and "Scan now" on the right; "Open Linear admin" opens `https://linear.app/acme/settings/members` in a new tab.
- [ ] The cards read "Users 7" and "Suspended in Google, still has access 1".
- [ ] The table adds "In Linear" after Status: Hannah Weber reads "Disabled", the others "Active"; Found via reads "Linear members"; the pending invitation is not listed.
- [ ] Suspend Chloé in the fake (`POST <fake connectors>/_fake/linear/members/chloe@acme.example/suspend`) and choose "Scan now": the header shows "Scanning…", then Chloé reads "Disabled" without a reload.
- [ ] Google Workspace's page reads "Connected" too, and has no "In …" column.

## Connecting from the page

On a new stack (`pnpm dev --drop-db`), add Linear grants for a few Acme people with `POST /_fake/grants` (`appName` "Linear", see [the fake apps](../fake-apps.md#control-endpoints)) before setup, then finish setup with the preselected apps; Linear is ignored.

- [ ] Linear's page shows "Approve", "Connect Linear" and the note.
- [ ] Connecting it there with `lin_api_acme_fake` turns the page, without a reload, to "Approved" and "Connected" with "Open Linear admin" and "Scan now", and lists the users with "In Linear" once the scan ends.

## Disable and Enable

On Linear's page, connected as above. Set `FAKE=http://127.0.0.1:<port>`, the port of the printed "Fake connectors (Acme)" address. Make Chloé active again first: `curl -s -X POST "$FAKE/_fake/linear/members/chloe@acme.example/reactivate"`, then "Scan now" until "In Linear" reads "Active".

- [ ] "Disable and Enable act in the Acme workspace." shows on the right of "Users".
- [ ] Mia Novak reads "You" beside her name and "Connected as you" at the end of her row; Hannah Weber ends with "Enable", the others with "Disable".
- [ ] "Disable" on Chloé opens "Disable Chloé Martin in Linear?" listing Person (initials, "Chloé Martin chloe@acme.example"), App (Linear) and Workspace (Acme), then "Chloé can no longer sign in to this workspace. You can enable the account again later.", "Broccoli Access makes the change in Linear with your connection, then reads the account back from Linear.", "Cancel" and "Disable in Linear"; "Cancel" and Escape change nothing.
- [ ] "Disable in Linear" closes the dialog; the row reads "Disabling in Linear…" with a spinner, then "In Linear" reads "Disabled", the row "Disabled just now" with "Enable", and a toast "Chloé Martin is disabled in Linear." shows at the bottom right; `curl -s "$FAKE/_fake/state"` lists Chloé suspended.
- [ ] With the fake slowed (`curl -s -H 'content-type: application/json' -d '{"milliseconds": 5000}' "$FAKE/_fake/delay"`), disable David, then confirm Gabriel's Disable while David's row still reads "Disabling in Linear…": Gabriel's row reads "Waiting for 1 change in Linear…" until David's change ends, then "Disabling in Linear…". Leaving the page and coming back shows each row where its change is.
- [ ] "Enable" on Chloé opens "Enable Chloé Martin in Linear?" with "Chloé’s account in this workspace becomes active again. You can disable it again later." and "Enable in Linear"; it ends with "Active", "Enabled just now", "Disable" and the toast "Chloé Martin is enabled in Linear.".
- [ ] After `curl -s -H 'content-type: application/json' -d '{"connector": "linear", "call": "actions/run", "code": "not_allowed", "count": 1}' "$FAKE/_fake/failures"`, disabling Chloé runs, then shows "Disable" again with Chloé still "Active".
- [ ] Google Workspace's page has no Disable or Enable.

## Not found

- [ ] `/apps/00000000-0000-4000-8000-000000000001` and `/apps/not-an-id` show "Page not found".

## Phone width

- [ ] At 390 px wide, nothing overflows the page; the table scrolls on its own.
