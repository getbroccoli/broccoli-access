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

## Remove

- [ ] On Hannah Weber's page the Linear row (disabled) offers "Enable" and "Remove". "Remove" asks "Remove Hannah Weber from Linear?" as on [Linear's page](app-page.md#remove); confirming shows "Removing from Linear…", then the row leaves the list without a reload.
- [ ] A failed Remove reads "Couldn’t remove" on the row and opens the same dialog as on Linear's page.

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

## Add or remove an app for one person

A run of its own: start from [Setup](#setup), and also select Zoom before "Approve and finish". Create Everyone with Slack and Notion, and assign it to Ivan Petrov and to Lena Fischer, who are active in Google. Ivan has a Notion account and no Slack account.

- [ ] On Ivan's page, the **×** at the end of the Notion row is named "Remove Notion for Ivan only". Choosing it strikes Notion through, shows **Removed by you** in **From** and offers **Undo**; **In the app** reads **Extra**, since Ivan has an active Notion account. The same on Slack, which he has no account in, reads **Not given**.
- [ ] **+ Add app** lists the approved apps that none of Ivan's templates gives. Choosing Zoom adds a Zoom row with **Added by you**, **Missing** and **Undo**. With Linear connected as in [Connections settings](connections-settings.md#apps), Linear opens its roles; choosing Admin adds it with the role Admin, and **Invite** stays offered.
- [ ] Lena's page still lists Notion and Slack from Everyone, without Zoom, and Everyone's page lists the same two apps.
- [ ] **Undo** on Notion brings back Everyone in **From** and the row's earlier status. **Undo** on Zoom takes its row away.
- [ ] Remove Notion for Ivan again, then take Everyone off him: Notion stays listed with **Removed by you**, **Extra** and **Undo**. **Undo** leaves it **Extra**, from **No template**.
- [ ] Ana's page (suspended in Google) offers no **+ Add app**.

## Offboard

Connect Slack and Linear, assign a template to Chloé Martin, and set `GOOGLE` to the fake Google's address.

- [ ] Chloé's page has "Offboard". It opens "Offboard Chloé Martin?" with her email, "Broccoli Access disables these now" listing Google Workspace with "Suspend" first, then Linear and Slack with "Disable", each ticked, and "You do these by hand" listing each app without a connection with "No connection".
- [ ] While Settings › Connections shows that Google Workspace only reads users, the button reads "Continue to Google". After `curl -s -H 'content-type: application/json' -d '{"scope": "https://www.googleapis.com/auth/admin.directory.user"}' "$GOOGLE/_fake/consent/refuse-scope"`, Allow at Google comes back to the open dialog with "Google was not allowed to change users. Nobody was offboarded."; Activity has no new row and her template is still assigned.
- [ ] "Continue to Google" again, then Allow, comes back to the dialog with "Offboard Chloé". Confirming closes it: each row shows its progress, then "Disabled" with "Enable"; the header shows "Suspended in Google" and "Offboarded today"; Templates is empty; a notice lists the apps that need the owner, each with its reason; and no row shows Missing or Extra.
- [ ] `curl -s "$GOOGLE/_fake/state"` counts one more suspended person, and `curl -s "$FAKE/_fake/state"` shows chloe@acme.example `suspended` in `.slack` and `.linear`.
- [ ] Activity lists her three changes, each "Disable" with "Offboarding" below.
- [ ] For Felix Wagner, after `curl -s -H 'content-type: application/json' -d '{"email": "felix@acme.example"}' "$FAKE/_fake/linear/invitations"` and "Scan now" on Linear's page, the dialog lists Linear under "You do these by hand" with "Open invitation".
- [ ] After `curl -s -H 'content-type: application/json' -d '{"connector": "slack", "call": "actions/run", "code": "not_allowed", "count": 1}' "$FAKE/_fake/failures"`, offboarding Felix suspends him in Google while Slack shows "Couldn’t disable"; the notice names Slack with "Couldn’t disable", and "Offboard" stays on his page.
- [ ] For Isla Murray, untick Slack and confirm: Slack stays "Active" with "Disable", and Activity has no Slack change for her.
- [ ] On a fresh stack, where Google Workspace again only reads users, untick Slack for Hugo Laurent, then "Continue to Google" and Allow: back in the dialog Slack is still unticked. Cancel, and open Offboard again: every app is ticked.
- [ ] On a fresh stack, "Disable" on a Google Workspace row reads "Continue to Google"; after Allow the page says "Google now lets Broccoli Access create and change users. Allowing it changed no account: ask for your change again if you still want it.", and no account changed.
- [ ] "Enable" on an offboarded person's Google Workspace row makes them "Active" again.
- [ ] On an offboarded Chloé whose Slack and Linear accounts are disabled (Slack's "Scan now" after its member is suspended), "Remove all…" beside "Apps" opens "Remove Chloé Martin from these apps?" listing Linear and Slack with her email, never Google Workspace, and "This cannot be undone." One "Remove all" removes both after that one confirmation: the rows show "Removing from…", then leave the list; `curl -s "$FAKE/_fake/state"` has her in neither `.slack` nor `.linear`, Google Workspace is still "Disabled" with "Enable", and "Remove all…" is gone. Activity has two "Remove" changes with no "Offboarding" below.
- [ ] A Remove that fails (the failures control on `actions/run`) reads "Couldn’t remove" on its row while the other app's account is removed.

## No delete

- [ ] Nothing on People or a person's page edits or removes a person.

## Not found

- [ ] `/people/00000000-0000-4000-8000-000000000001` and `/people/not-an-id` show "Page not found".

## Phone width

- [ ] At 390 px wide, nothing overflows the page; the table stays inside its frame.

## Provision

Start on a freshly seeded stack (`pnpm dev --drop-db`), since the checks above change the people these use. Connect Slack and Linear (see [Connections settings](connections-settings.md#apps)) and set `FAKE` as "Disable and Enable" in [App page](app-page.md) says. In Templates, create Everyone with Slack and Claude, and Engineer with Linear as Admin. Open Ivan Petrov, who has no Slack or Linear member and no Claude account, and assign both.

- [ ] Below Ivan's apps a bar reads "3 apps missing." with "Provision". Slack, Linear and Claude show **Missing**.
- [ ] "Provision" asks "Provision Ivan Petrov?" with ivan@acme.example, and lists Claude with "By hand", Linear with "Admin" and "Broccoli Access", and Slack with "Member" and "Broccoli Access"; then "Each app Broccoli Access invites Ivan to sends its own invitation email.", "Invite Ivan in each app marked By hand yourself, then confirm it with By hand on this page.", "Cancel" and "Provision 3 apps". When every listed app is an invite the line reads "Each app sends Ivan its own invitation email." Cancel changes nothing.
- [ ] Confirming shows "Inviting to Linear…" and "Inviting to Slack…", then "Invited on <today>" on both without a reload. `curl -s "$FAKE/_fake/state" | jq '.invitations'` lists one invitation for ivan@acme.example in `slack`, and one in `linear` with the role `admin`.
- [ ] The bar now reads "1 app missing." without "Provision", and Claude's row shows **Missing** with "By hand". "By hand" asks "Did you invite Ivan Petrov to Claude yourself?" and "Broccoli Access marks Ivan as invited to Claude, done by hand by you."; "Yes, I did it" turns the row to "Invited on <today>" and the bar goes.
- [ ] After `curl -s -X POST "$FAKE/_fake/slack/invitations/ivan@acme.example/accept"`, the same for `linear`, and "Scan now" on both apps' pages, Ivan's Slack and Linear rows read "Active" with "—" as their role, since an account keeps the role it has in its app, and nothing is missing.
- [ ] Create a second template, Design, with Linear as Guest, and assign it and Engineer to Lena Fischer, who has no Linear member: the bar reads "1 app missing. Pick Linear’s role first." and "Provision" is disabled until a role is picked on Linear's row.
- [ ] After `fail unexpected_response` (see [the app page](app-page.md#when-a-change-fails)), provisioning Lena ends Linear's row with **Missing**, "Couldn’t invite" and "Try again"; the bar offers "Provision" again, and either one invites her. Activity reads "Provision" under both of her invites.
- [ ] Hannah Weber has a disabled Linear account. With Engineer assigned, her Linear row shows "—" as its role, "Disabled" and **Missing**; the dialog lists Linear with "Enable" and no line about invitation emails, and confirming ends with "Active" and "Disable".
- [ ] Ana Ruiz, suspended in Google, shows no "Provision" whatever her templates.
