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

## Suspended with access

- [ ] The tab shows "People suspended in Google who still have an account in an approved app. Remove them in each app.", no search, and the column "Still has access to": Ana "Figma, Notion, Slack", Ben "Slack".
- [ ] Suspend `elif@acme.example` in the fake Google (`POST <fake>/_fake/users/elif@acme.example/suspend`) and choose "Scan now": the line shows "Scanning…" and the button is disabled; when the scan ends, without a reload, Elif appears with "Figma, Notion, Slack", the tab and the sidebar show 3 and the line shows the new time.
- [ ] Ignore Slack on Applications and open People: Ben leaves the tab and the counts drop by one.

## Robustness

- [ ] `/people?view=bogus&q=` opens All.
- [ ] With the API failing, the page shows "Couldn’t load people" and "Try again" reloads it once the API is back.
- [ ] At 390 px wide the search field goes under the tabs and the table stays inside its frame.
