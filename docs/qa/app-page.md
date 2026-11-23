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
- [ ] Next to "Ignore", "Connect Slack" opens the Connect Slack dialog of Settings → Connections (see "Connect Slack" in [Connections settings](connections-settings.md)); once connected, the page shows Slack's members without a reload.
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
- [ ] "Disable" on Chloé opens "Disable Chloé Martin in Linear?" listing Person (initials, "Chloé Martin chloe@acme.example"), App (Linear) and Workspace (Acme), then "Chloé can no longer sign in to this workspace. You can enable the account again later.", "Broccoli Access makes the change with your personal API key, then reads the account back from Linear.", "Cancel" and "Disable in Linear"; "Cancel" and Escape change nothing.
- [ ] "Disable in Linear" closes the dialog; the row reads "Disabling in Linear…" with a spinner, then "In Linear" reads "Disabled", the row "Disabled just now" with "Enable", and a toast "Chloé Martin is disabled in Linear." with "View in Activity" shows at the bottom right; `curl -s "$FAKE/_fake/state"` lists Chloé suspended.
- [ ] With the fake slowed (`curl -s -H 'content-type: application/json' -d '{"milliseconds": 5000}' "$FAKE/_fake/delay"`), disable David, then confirm Gabriel's Disable while David's row still reads "Disabling in Linear…": Gabriel's row reads "Waiting for 1 change in Linear…" until David's change ends, then "Disabling in Linear…". Leaving the page and coming back shows each row where its change is.
- [ ] "Enable" on Chloé opens "Enable Chloé Martin in Linear?" with "Chloé’s account in this workspace becomes active again. You can disable it again later." and "Enable in Linear"; it ends with "Active", "Enabled just now", "Disable" and the toast "Chloé Martin is enabled in Linear.".
- [ ] Google Workspace's page has no Disable or Enable.

## When a change fails

On Linear's page as above, with Chloé, David and Gabriel active in Linear. `fail <code>` stands for `curl -s -H 'content-type: application/json' -d '{"connector": "linear", "call": "actions/run", "code": "<code>", "count": 1}' "$FAKE/_fake/failures"`, which makes the next change fail with that code.

- [ ] After `fail unexpected_response`, disabling Chloé runs, then her "In Linear" reads "Couldn’t disable" in red and the row ends with "Try again"; Chloé stays "Active" in `curl -s "$FAKE/_fake/state"`.
- [ ] "Couldn’t disable" opens "Couldn’t disable Chloé Martin in Linear", "Asked by Mia Novak today at <time>. Chloé still has access to the Acme workspace.", the reason "Linear gave an answer Broccoli Access doesn’t recognise. Linear may have changed how its admin pages work. Nothing changed in Linear.", the hint "Try again in a while, or deactivate Chloé in Linear’s admin yourself and tell Broccoli Access.", "I did it by hand", "Open Linear admin" (to `https://linear.app/acme/settings/members`) and "Try again".
- [ ] "Try again" in the dialog or on the row runs a new Disable, which ends with "Disabled" and "Disabled just now"; Enable her again.
- [ ] After the same `curl` with `"code": "rate_limited", "count": 3` (one plan for three calls), disabling Chloé ends with "Couldn’t disable", and the reason reads "Linear didn’t answer after three tries. Nothing changed in Linear."
- [ ] "I did it by hand" in that dialog closes it and asks "Did you deactivate Chloé Martin in Linear yourself?" with "Broccoli Access marks Chloé’s Linear account as disabled, done by hand by you. The next scan checks it.", "Not yet" and "Yes, I did it". "Not yet" changes nothing; "Yes, I did it" turns "In Linear" to "Disabled" with "Enable" at once, without a call to Linear. "Scan now" reads her "Active" again, since Linear never changed.
- [ ] Ana (suspended in Google): after a failed Disable "Suspended in Google, still has access" still counts her; marking it done by hand drops the count by one.
- [ ] After `fail not_allowed`, disabling David ends with "Couldn’t disable" and no "Try again" on the row; the dialog reads "Linear doesn’t allow this change. Linear refuses it for some members, such as the workspace’s owner. Nothing changed in Linear.", "Trying again won’t help. If someone with more rights in Linear makes the change there, tell Broccoli Access.", "I did it by hand", "Open Linear admin" and "Close".
- [ ] After `fail account_not_found`, disabling Gabriel ends with "Couldn’t disable" and no "Try again"; the dialog reads "Asked by Mia Novak today at <time>." only, "Linear has no member matching Gabriel Silva (gabriel@acme.example). The account may have been removed, or its email changed in Linear. Nothing changed in Linear.", "Trying again won’t help. Scan Linear to bring its member list up to date.", "Open Linear admin" and "Scan Linear now", with no "I did it by hand". "Scan Linear now" closes it, scans, and once the scan ends the row offers "Try again" and the dialog's hint reads "Linear was scanned since, so trying again may help."
- [ ] A failed Enable reads "Couldn’t enable" and "Couldn’t enable <name> in Linear", with "reactivate" in the hint and the by-hand question, and no "still has access" sentence.
- [ ] At 390 px wide, each dialog's buttons stack, the main one on top.

## Not found

- [ ] `/apps/00000000-0000-4000-8000-000000000001` and `/apps/not-an-id` show "Page not found".

## Phone width

- [ ] At 390 px wide, nothing overflows the page; the table scrolls on its own.
