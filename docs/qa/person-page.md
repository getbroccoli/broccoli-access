# QA: A person's page

A manual check of a person's page, `/people/<id>`, against a development stack.

## Setup

1. Start the stack with `pnpm dev --drop-db`, connect Google Workspace and finish setup with the six preselected apps, as in [QA setup](setup.md).
2. Use the browser that finished setup, and open Ana Ruiz from People.

## Ana Ruiz, suspended with access

- [ ] The page shows "‹ People", which leads back to People, Ana's initials, "Ana Ruiz" with a "Suspended in Google" badge, and `ana@acme.example` below.
- [ ] An amber box reads "Ana is suspended in Google but still has accounts in 3 approved apps."
- [ ] Under "Current access", the table lists App, Found via and Since: Figma, Notion and Slack, in that order, each with its initial, "Google sign-in" and "Before <date>" about six months before the scan. Google Workspace is not listed.
- [ ] Ben Ito's page reads "Ben is suspended in Google but still has accounts in 1 approved app." and lists Slack only.

## Active person

- [ ] Chloé Martin's page has no badge and no amber box, and lists her approved apps by name.
- [ ] Ignore Slack on Applications and open Ben's page again: the "Suspended in Google" badge stays, the amber box is gone and the table reads "No accounts in approved apps."

## No delete

- [ ] Nothing on People or a person's page edits or removes a person.

## Not found

- [ ] `/people/00000000-0000-4000-8000-000000000001` and `/people/not-an-id` show "Page not found".

## Phone width

- [ ] At 390 px wide, nothing overflows the page; the table stays inside its frame.
