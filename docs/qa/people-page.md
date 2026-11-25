# QA: People

A manual check of the People page against a development stack: everyone in Google Workspace with their status and apps, the "Suspended with access" tab and the sidebar badge.

## Setup

1. Start the stack, connect Google Workspace as `admin@acme.example`, and finish setup with the six preselected apps ("Approve 6 and finish") as in [QA setup](setup.md).
2. Note the fake Google's address that `pnpm dev` prints; its controls are under `/_fake` (see `docs/fake-apps.md`).

## All

- [ ] People shows "Everyone in your Google Workspace. Scanned today at HH:MM" under the title, with the time of the last scan in the browser's time zone and no full stop, and "Scan now" at the right.
- [ ] The tabs read "All 42" and "Suspended with access 2"; the sidebar's People item shows 2.
- [ ] The table lists Ana Ruiz and Ben Ito first, "Suspended", then everyone else "Active" by name, each with initials, name and email.
- [ ] Apps lists each person's approved apps with an active account, comma separated, without Google Workspace: Ana shows "Figma, Notion, Slack", Mia Novak "Slack".
- [ ] Ten people show, then "Show 32 more"; it shows the rest.
- [ ] Typing in "Search by name or email" filters by name or email, ignoring case, after a short pause; the URL holds `q`. A search without matches shows "No people match “…”".
- [ ] No row has actions or checkboxes, and nothing on the page removes a person.
- [ ] Clicking a name opens that person's page, `/people/<id>`; see [QA: A person's page](person-page.md).

## Suspended with access

- [ ] The tab shows "People suspended in Google who still have an account in an approved app. Remove them in each app.", no search, and the column "Still has access to": Ana "Figma, Notion, Slack", Ben "Slack".
- [ ] Suspend `elif@acme.example` in the fake Google (`POST <fake>/_fake/users/elif@acme.example/suspend`) and choose "Scan now": the line shows "Scanning…" and the button is disabled; when the scan ends, without a reload, Elif appears with "Figma, Notion, Slack", the tab and the sidebar show 3 and the line shows the new time.
- [ ] Ignore Slack on Applications and open People: Ben leaves the tab and the counts drop by one.

## Robustness

- [ ] `/people?view=bogus&q=` opens All.
- [ ] With the API failing, the page shows "Couldn’t load people" and "Try again" reloads it once the API is back.
- [ ] At 390 px wide the search field goes under the tabs and the table stays inside its frame.

## Differences

1. Use a fresh development database. Connect Linear with the fake key and wait for its scan. Assign an empty Engineering template to Ivan Petrov, Elif Demir and Chloé Martin.
2. Add Linear to Engineering. The Templates page marks Engineering. In People → Differences, Linear shows two people under Missing. No account has changed yet.
3. Open Provision beside Linear and check it lists Ivan and Elif. Confirm once. Read `invitations.linear` in the fake connectors' `GET /_fake/state` and check for exactly one pending invitation per person. The Missing count drops to zero and the template mark clears.
4. Take Engineering off Chloé. Her active Linear account shows under Extra even though she has no template. Keep clears the row. Confirm her account stays active and her person page shows Linear as "Added by you" with no template assigned.
5. Assign Engineering to David Okafor and take it off again. Disable his extra Linear account and check that his row clears once the fake suspends the account.

## Accounts without a person

- [ ] Start from the setup above with Slack approved. Use the fake Google's unsuspend control for Ana, then scan Google Workspace. Connect Slack and Linear and let their scans finish. The tab shows four accounts. Ana’s private Slack address suggests Ana Ruiz. The other three show "Nobody".
- [ ] Choose "Link" beside Ana’s suggestion. The count drops to three. Open Ana from All. Her Slack work account and the account labelled `ana.ruiz@gmail.example` both appear under Current access.
- [ ] In Settings → Connections, choose "Scan now" on Slack. Once the scan finishes, reopen Ana’s page and the tab. The private account stays on Ana’s page and the tab still shows three.
- [ ] Choose "Decide", then "Link to a person" beside a different account, leaving Linear’s `deploys@acme.example` for Disable. Search by work email, select the employee and choose "Link". The account appears on that person’s page.
- If the member changes their app email, the new unmatched address needs a new link.

- [ ] Open "Decide" on Linear’s active `deploys@acme.example` account. Choose Disable and confirm. The row shows "Disabling in Linear…", then "Disabled" without a reload, and "Decide" now offers Enable. In Activity, its Disable shows "On the server" under "How it ended".
- [ ] Choose Enable from "Decide" and confirm: the row shows "Enabling in Linear…", then no status, and "Decide" offers Disable again.
- [ ] Make the next change fail (`POST <fake connectors>/_fake/failures` with `{"connector": "linear", "call": "actions/run", "code": "not_allowed", "count": 1}`) and choose Disable again. The row shows "Couldn’t disable". It opens the reason with "I did it by hand"; confirming it shows "Disabled" on the row. After a failure that trying again can help (`unexpected_response`), the dialog offers "Try again", and the row follows the new change.
- [ ] "Decide" on an active unlinked account offers no "Remove". Suspend an unlinked member in the fake and scan its app: "Decide" adds "Remove". It opens "Remove <display name> from <App>?"; confirming shows "Removing from <App>…", then the row leaves the list and the tab count drops by one without a reload.
- [ ] Make the next change fail with `unexpected_response` and remove another disabled unlinked account: the row shows "Couldn’t remove", whose dialog names the account as the confirmation did (its display name) and offers "Try again", which removes it.
- [ ] From "Decide", mark two unlinked accounts, one as a service account and one as external. Save a note for each. The tab count drops by two and both move to Marked accounts with the right labels and notes.
- [ ] Save stays disabled for a note of spaces only. A note over 500 characters shows "Keep the note to 500 characters or fewer." and Save stays disabled.
- [ ] Edit an owner's note, reload, and scan the app again. The edited note and both marks stay.
- [ ] Create the integration user in Settings → Connections. People shows "Scanning…" by itself; once it ends, the integration user's Google Workspace account is under Marked accounts as "Integration user" with no Edit button, and never in the list above or its count.
- [ ] Invite the integration user to the fake Linear workspace and accept the invitation. Scan Linear. Its Linear account also shows under Marked accounts as "Integration user" with no Edit button.
