# QA: A person's page

A manual check of a person's page, `/people/<id>`, against a development stack.

## Setup

1. Start the stack with `pnpm dev --drop-db`, connect Google Workspace and finish setup with the six preselected apps, as in [QA setup](setup.md).
2. Use the browser that finished setup, and open Ana Ruiz from People.

## Ana Ruiz, suspended with access

- [ ] The page shows "‹ People", which leads back to People, Ana's initials, "Ana Ruiz" with a "Suspended in Google" badge, and `ana@acme.example` below.
- [ ] An amber box reads "Ana is suspended in Google but still has accounts in 3 approved apps."
- [ ] Under "Apps", Figma, Notion and Slack show "Active", "Google sign-in" and "Before <date>" about six months before the scan. Google Workspace shows "Disabled". The templates section offers no assignment while Ana is suspended.
- [ ] Ben Ito's page reads "Ben is suspended in Google but still has accounts in 1 approved app." and lists his Slack and directory accounts.

## Active person

- [ ] Chloé Martin's page shows the Active badge, offers Assign template and lists her apps by name.
- [ ] Ignore Slack on its page and open Ben's page again: the "Suspended in Google" badge stays, the amber box is gone and his directory account stays listed.

## Disable and Enable

Approve Slack again on its page, connect Linear as in [Connections settings](connections-settings.md#apps), and wait for its scan; then open Ana's page again.

- [ ] The amber box reads "Ana is suspended in Google but still has accounts in 4 approved apps. Disable them here where the app is connected, and in the app itself where it isn’t.", and the table adds a Linear row, "Active" and ending with "Disable"; Figma, Notion and Slack still end with "No connection".
- [ ] "Disable" on Linear asks "Disable Ana Ruiz in Linear?"; confirming runs as on Linear's page and ends with "Disabled", "Disabled just now", "Enable" and the toast; the row stays listed and the amber box reads "… accounts in 3 approved apps." without the second sentence, since none of those apps is connected.
- [ ] "Enable" brings Linear back to "Active" with "Disable".
- [ ] After `fail unexpected_response` (see [the app page](app-page.md#when-a-change-fails)) and a Disable of Linear here, the Linear row reads "Couldn’t disable" with "Try again" and opens the same dialog; "I did it by hand" turns it to "Disabled" with "Enable", and the amber box to "… accounts in 3 approved apps." at once.

### Account actions with templates

- [ ] Create a template named Linear users with Linear as its only app. Assign it to Chloé, then take it off. Her Linear row shows a single **Extra** status badge and offers **Disable**. Use `fail unexpected_response` and disable the account from that row. **Extra** stays visible during progress and alongside **Couldn’t disable** and **Try again**. Retry. Once the account is disabled, Extra clears and the row shows **Disabled** and **Enable**.
- [ ] Assign Linear users to Chloé again. The row shows both **Disabled** and **Missing**. Set `fail unexpected_response` as described above, then choose **Enable**. Open the failure and choose **I did it by hand**. With the Network panel recording, use a local test proxy to allow the confirmation mutation and fail the next person-page read once. Confirm. The page says the change was saved, explains that the displayed access could not refresh and offers a retry.
- [ ] Retry from that message. The Network panel shows a read and just one confirmation mutation across both attempts. Without a reload, the row shows **Active** and **Disable**, and Missing clears.

## Invite

Linear stays connected as above. Set `FAKE` as "Disable and Enable" in [App page](app-page.md) says, and open Ivan Petrov's page: he is active in Google and has no Linear member.

- [ ] The table lists Linear with "No account" and "Invite". Ana's and Ben's pages (suspended in Google) and Chloé's (a Linear member) list no such row.
- [ ] "Invite" asks "Invite Ivan Petrov to Linear?" with Person (Ivan Petrov, ivan@acme.example), App (Linear) and Workspace (Acme), "Linear sends Ivan an invitation to join this workspace, unless they already have one or have joined. Their account shows here once Linear is scanned after they join.", "Cancel" and "Invite to Linear".
- [ ] Confirming shows "Inviting to Linear…", then "Invited on <today>" without a reload; `curl -s "$FAKE/_fake/state" | jq '.invitations.linear'` lists one invitation for ivan@acme.example. A reload keeps "Invited on <today>" and no "Invite".
- [ ] After "Scan now" on Linear's page, his row still reads "Invited on <today>": the scan read the invitation in Linear.
- [ ] After `curl -s -X POST "$FAKE/_fake/linear/invitations/ivan%40acme.example/expire"`, his row stays "Invited on <today>" until "Scan now" on Linear's page; then it offers "Invite" again.
- [ ] Invite him again. After `curl -s -X POST "$FAKE/_fake/linear/invitations/ivan@acme.example/accept"` and "Scan now" on Linear's page, Ivan's Linear row reads "Active", "Linear members" and "Disable", and the invite row is gone.
- [ ] With Slack connected (see [Connections settings](connections-settings.md#apps)), Ivan's page offers "Invite" on Slack too.
- [ ] An invitation sent in Slack itself shows: after `curl -s -H 'content-type: application/json' -d '{"email": "ivan@acme.example"}' "$FAKE/_fake/slack/invitations"` and "Scan now" on Slack's page, his Slack row reads "Invited on <today>", the day the scan first saw it, with no "Invite". People still counts no Slack account for him.
- [ ] After `curl -s -X POST "$FAKE/_fake/slack/invitations/ivan%40acme.example/expire"` and "Scan now" on Slack's page, his Slack row offers "Invite" again, and inviting him puts one invitation for ivan@acme.example in `.invitations.slack`.
- [ ] Assign Linear users to Elif Demir. Her Linear row shows **Missing** and still offers **Invite**. After `fail unexpected_response` (see [the app page](app-page.md#when-a-change-fails)), inviting her to Linear ends with "Couldn’t invite" in red and "Try again". The dialog reads "Couldn’t invite Elif Demir to Linear", the reason ending "Nothing changed in Linear.", "Try again in a while, or invite Elif in Linear’s admin yourself and tell Broccoli Access.", "I did it by hand", "Open Linear admin" and "Try again".
- [ ] "I did it by hand" asks "Did you invite Elif Demir to Linear yourself?"; "Yes, I did it" shows "Invited on <today>" on the same row. Missing and Invite disappear without a reload.
- [ ] With Linear in Reconnect (`curl -s -X POST "$FAKE/_fake/linear/keys/revoke"`, then "Scan now" on Linear's page), Lena Fischer's Linear row shows "Reconnect" instead of "Invite".

## Assign templates

1. In Templates, create Everyone with Google Workspace and Miro, and Engineer with Figma. Open Ivan Petrov from People.
2. Choose **+ Assign template**, then Everyone. Repeat for Engineer. Both chips show their names and a take-off button. Each app appears once, with its template in **From**. Apps Ivan lacks show **Missing**.
3. Open Engineer. Follow Ivan's link under **People with this template** back to his page. Take Engineer off and check that Ivan leaves its people list and the count drops by one.
4. Add Notion to Everyone and Engineer, then assign Engineer to Ivan again. Ivan already has an active Notion account. His single Notion row lists both templates. Take off Engineer. Notion stays active with Everyone as its only source. Take off Everyone. Notion now shows **Extra**.

### Picker requests and interrupted refresh

- [ ] Open the browser's Network panel before loading an active person's page. Inspect the GraphQL operations on load and while an account change is running. The closed picker makes no request for the template catalog. Open **+ Assign template** and check that it requests a bounded page of options. Close it and check that account polling leaves the catalog alone. Opening suspended Ana's page also leaves the catalog alone.
- [ ] Open Ivan's picker. Use a local HTTP test proxy to let **Assign template** succeed and fail the next person-page read. Assign Engineer. Verify the mutation response contains the saved template and a null error. The page says the assignment was saved, explains the refresh failure and offers a retry. Restore the connection and retry from that message. In the Network panel, verify that retry sends a read and the assignment mutation ran only once. Engineer appears once and its people count includes Ivan once.
- [ ] Create 13 templates named Picker 01 through Picker 13 and assign the first 12 to Ivan. Give Ivan any earlier alphabetic templates too. Open his picker again. The first page offers Picker 13 without an extra click to get past the 12 assigned templates.
- [ ] Keep Ivan's picker open with Picker 13 available. In the fake Google, suspend Ivan with `POST <fake>/_fake/users/ivan@acme.example/suspend`. In another tab, run **Scan now** for Google and wait for success. In the original tab choose Picker 13. The refusal explains that assigning it requires someone active in the directory. After refreshing, Ivan keeps his existing chips and their take-off buttons, with an explanation beside them of why he cannot receive another template. Picker 13 was never assigned.

## No delete

- [ ] Nothing on People or a person's page edits or removes a person.

## Not found

- [ ] `/people/00000000-0000-4000-8000-000000000001` and `/people/not-an-id` show "Page not found".

## Phone width

- [ ] At 390 px wide, nothing overflows the page; the table stays inside its frame.
