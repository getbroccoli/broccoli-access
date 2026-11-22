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

## Not found

- [ ] `/apps/00000000-0000-4000-8000-000000000001` and `/apps/not-an-id` show "Page not found".

## Phone width

- [ ] At 390 px wide, nothing overflows the page; the table scrolls on its own.
