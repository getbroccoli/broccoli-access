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

## No delete

- [ ] Nothing on People or a person's page edits or removes a person.

## Not found

- [ ] `/people/00000000-0000-4000-8000-000000000001` and `/people/not-an-id` show "Page not found".

## Phone width

- [ ] At 390 px wide, nothing overflows the page; the table stays inside its frame.
