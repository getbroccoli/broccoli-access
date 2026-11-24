# QA: A person's page

A manual check of a person's page, `/people/<id>`, against a development stack.

## Setup

1. Start the stack with `pnpm dev --drop-db`, connect Google Workspace and finish setup with the six preselected apps, as in [QA setup](setup.md).
2. Use the browser that finished setup, and open Ana Ruiz from People.

## Ana Ruiz, suspended with access

- [ ] The page shows "‹ People", which leads back to People, Ana's initials, "Ana Ruiz" with a "Suspended in Google" badge, and `ana@acme.example` below.
- [ ] An amber box reads "Ana is suspended in Google but still has accounts in 3 approved apps."
- [ ] Under "Current access", the table lists App, In the app ("Active"), Found via and Since, with "No connection" at the end of each row: Figma, Notion and Slack, in that order, Figma and Notion with their logo and Slack with its initial, "Google sign-in" and "Before <date>" about six months before the scan. Google Workspace is not listed.
- [ ] Ben Ito's page reads "Ben is suspended in Google but still has accounts in 1 approved app." and lists Slack only.

## Active person

- [ ] Chloé Martin's page has no badge and no amber box, and lists her approved apps by name.
- [ ] Ignore Slack on its page and open Ben's page again: the "Suspended in Google" badge stays, the amber box is gone and the table reads "No accounts in approved apps."

## Disable and Enable

Approve Slack again on its page, connect Linear as in [Connections settings](connections-settings.md#apps), and wait for its scan; then open Ana's page again.

- [ ] The amber box reads "Ana is suspended in Google but still has accounts in 4 approved apps. Disable them here where the app is connected, and in the app itself where it isn’t.", and the table adds a Linear row, "Active" and ending with "Disable"; Figma, Notion and Slack still end with "No connection".
- [ ] "Disable" on Linear asks "Disable Ana Ruiz in Linear?"; confirming runs as on Linear's page and ends with "Disabled", "Disabled just now", "Enable" and the toast; the row stays listed and the amber box reads "… accounts in 3 approved apps." without the second sentence, since none of those apps is connected.
- [ ] "Enable" brings Linear back to "Active" with "Disable".
- [ ] After `fail unexpected_response` (see [the app page](app-page.md#when-a-change-fails)) and a Disable of Linear here, the Linear row reads "Couldn’t disable" with "Try again" and opens the same dialog; "I did it by hand" turns it to "Disabled" with "Enable", and the amber box to "… accounts in 3 approved apps." at once.

## Invite

Linear stays connected as above. Set `FAKE` as "Disable and Enable" in [App page](app-page.md) says, and open Ivan Petrov's page: he is active in Google and has no Linear member.

- [ ] After his accounts, the table lists Linear with "No account" and "Invite". Ana's and Ben's pages (suspended in Google) and Chloé's (a Linear member) list no such row.
- [ ] "Invite" asks "Invite Ivan Petrov to Linear?" with Person (Ivan Petrov, ivan@acme.example), App (Linear) and Workspace (Acme), "Linear emails Ivan an invitation to join this workspace as a regular member. Their account shows here once they accept and Linear is scanned.", "Cancel" and "Invite to Linear".
- [ ] Confirming shows "Inviting to Linear…", then "Invited on <today>" without a reload; `curl -s "$FAKE/_fake/state" | jq '.invitations.linear'` lists one invitation for ivan@acme.example. A reload keeps "Invited on <today>" and no "Invite".
- [ ] After `curl -s -X POST "$FAKE/_fake/linear/invitations/ivan@acme.example/accept"` and "Scan now" on Linear's page, Ivan's Linear row reads "Active", "Linear members" and "Disable", and the invite row is gone.
- [ ] With Slack connected (see [Connections settings](connections-settings.md#apps)), Ivan's page offers "Invite" on Slack too, and inviting him puts one invitation in `.invitations.slack`.
- [ ] After `fail unexpected_response` (see [the app page](app-page.md#when-a-change-fails)), inviting Elif Demir to Linear ends with "Couldn’t invite" in red and "Try again". The dialog reads "Couldn’t invite Elif Demir to Linear", the reason ending "Nothing changed in Linear.", "Try again in a while, or invite Elif in Linear’s admin yourself and tell Broccoli Access.", "I did it by hand", "Open Linear admin" and "Try again".
- [ ] "I did it by hand" asks "Did you invite Elif Demir to Linear yourself?"; "Yes, I did it" turns her row to "No account" and "Invited on <today>" at once.
- [ ] With Linear in Reconnect (`curl -s -X POST "$FAKE/_fake/linear/keys/revoke"`, then "Scan now" on Linear's page), Lena Fischer's Linear row shows "Reconnect" instead of "Invite".

## No delete

- [ ] Nothing on People or a person's page edits or removes a person.

## Not found

- [ ] `/people/00000000-0000-4000-8000-000000000001` and `/people/not-an-id` show "Page not found".

## Phone width

- [ ] At 390 px wide, nothing overflows the page; the table stays inside its frame.
