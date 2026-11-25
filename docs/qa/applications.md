# QA: Applications

A manual check of the Applications page, the home page, against a development stack.

## Setup

1. Start the stack with `pnpm dev --drop-db` and connect Google Workspace as in [QA setup](setup.md). Keep Slack selected and also select Notion, Figma, Miro, Loom and Claude before finishing setup.
2. Use the browser that finished setup.

## Header and tabs

- [ ] `/` opens Applications on Approved, with "Applications" highlighted in the left menu.
- [ ] The header reads "Applications" and "Scanned today at HH:MM" with the last scan's time, without a full stop, and "Scan now" on the right.
- [ ] The tabs read "Approved 7", "Discovered 0" and "Ignored 31".

## Approved

- [ ] The table lists App (logo or initial, name, domain), Users, Found via, Suspended in Google and Connection: Google Workspace "Google directory", then Slack, Notion, Figma, Miro, Loom and Claude, each "Google sign-in", then Linear with only its name, "linear.app" and "Connect". Notion, Figma, Miro, Loom and Claude show their logo; Google Workspace, Slack and Linear their initial.
- [ ] Users shows four avatars, then the rest of the 42, 41, 31, 16, 12, 11 and 9 people: "+38", "+37", "+27", "+12", "+8", "+7" and "+5".
- [ ] Hovering an avatar, or reaching it with Tab, shows the person's name and email; Slack's first four are Ana Ruiz and Ben Ito, suspended in Google, then Aisha Khan and Bruno Costa. A screen reader reads each avatar as "<name>, <email>", then "41 in total"; an avatar opens the person's page.
- [ ] Slack shows "2 still have access", Notion and Figma "1 still has access"; the others show nothing there.
- [ ] No row has "Ignore" or "Approve".
- [ ] Clicking an app's name opens its page (see [App page](app-page.md)); Linear's name opens nothing until it is connected.

## Moving apps

- [ ] Ignoring Claude on its page (see [App page](app-page.md#actions)) removes it from Approved; the tabs read "Approved 6" and "Ignored 32".
- [ ] Ignored lists App, People, Found via and Since; each row has "Approve" and no "Ignore".
- [ ] "Approve" on ChatGPT in Ignored removes it there; the tabs read "Approved 7" and "Ignored 31", and Approved lists it.
- [ ] Claude's and ChatGPT's history (`record_history`) holds one line each for the change.

## Scan now

- [ ] Add a grant for a new app in the fake Google (`POST /_fake/grants` with an `email`, a new `clientId` and an `appName`, see [the fake apps](../fake-apps.md#control-endpoints)), then "Scan now": the button turns inactive and the header reads "Scanning…"; within a minute, without a reload, the header shows the new time and the counts and the left menu's badge show the new app in Discovered.
- [ ] The new app has no Manageable chip. Its row has "Approve" and no "Ignore". Approving it moves it to Approved and clears the left menu's badge.

## Connection

- [ ] Back on Approved, only Slack and Linear show "Connect"; the other rows leave Connection empty. A screen reader reads them "Connect Slack" and "Connect Linear".
- [ ] Slack's "Connect" opens the Connect Slack dialog, as in Settings → Apps.
- [ ] Linear's "Connect" opens the "Connect Linear" dialog described in [Apps settings](apps-settings.md#apps). Cancel it before scanning again.
- [ ] Before connecting Linear, add a Linear grant and scan again. In Discovered, Linear shows "Manageable" after its name with the description "Broccoli Access can manage accounts in this app once you connect it."
- [ ] Open Linear's page from Discovered and choose "Connect Linear". A wrong key reads "Linear refused it. Check it and try again." and keeps the dialog open. Enter `lin_api_acme_fake` and check that the dialog closes and Linear is connected. Back on Applications, the Discovered badge clears and the Approved count goes up by one.

## Phone width

- [ ] At 390 px wide, nothing overflows the page; the table scrolls on its own.
