# QA: Applications

A manual check of the Applications page, the home page, against a development stack.

## Setup

1. Start the stack with `pnpm dev --drop-db`, connect Google Workspace and finish setup with the six preselected apps, as in [QA setup](setup.md) and [QA setup page](setup-page.md).
2. Use the browser that finished setup.

## Header and tabs

- [ ] `/` opens Applications on Approved, with "Applications" highlighted in the left menu.
- [ ] The header reads "Applications" and "Scanned today at HH:MM" with the last scan's time, without a full stop, and "Scan now" on the right.
- [ ] The tabs read "Approved 7", "Discovered 0" and "Ignored 31".

## Approved

- [ ] The table lists App (initial, name, domain), Users, Found via and Suspended in Google: Google Workspace 42 "Google directory", Slack 41, Notion 31, Figma 16, Miro 12, Loom 11 and Claude 9, each "Google sign-in".
- [ ] Slack shows "2 still have access", Notion and Figma "1 still has access"; the others show nothing there.
- [ ] Every row but Google Workspace has an outlined "Ignore"; no row has "Approve".
- [ ] Clicking an app's name opens its page (see [App page](app-page.md)).

## Moving apps

- [ ] "Ignore" on Claude removes it from Approved without a reload; the tabs read "Approved 6" and "Ignored 32".
- [ ] Ignored lists App, People, Found via and Since; each row has "Approve" and no "Ignore".
- [ ] "Approve" on ChatGPT in Ignored removes it there; the tabs read "Approved 7" and "Ignored 31", and Approved lists it.
- [ ] Claude's and ChatGPT's history (`record_history`) holds one line each for the change.

## Scan now

- [ ] Add a grant for a new app in the fake Google (`POST /_fake/grants` with an `email`, a new `clientId` and an `appName`, see [the fake apps](../fake-apps.md#control-endpoints)), then "Scan now": the button turns inactive and the header reads "Scanning…"; within a minute, without a reload, the header shows the new time and the counts and the left menu's badge show the new app in Discovered.
- [ ] A Discovered row has "Approve" and "Ignore"; "Approve" moves it to Approved and the left menu's badge goes.

## Phone width

- [ ] At 390 px wide, nothing overflows the page; the table scrolls on its own.
