# QA: App frame and menus

A manual check of the left menu, the workspace menu, Settings and the profile menu, against a development stack.

## Setup

1. Start the stack, connect Google Workspace and move setup on as in [QA setup](setup.md).
2. Use the browser that connected Google Workspace.

## App menu

- [ ] The left menu shows the workspace menu at the top, "Applications", "People" and "Activity", and the profile button at the bottom; while apps are discovered, Applications shows their number, and while people are suspended with access, People shows theirs in amber.
- [ ] The open page's item is highlighted, and only that one.
- [ ] The workspace menu shows the organisation's initial and name ("A", "Acme") and opens with them, then "Settings".

## Settings

- [ ] "Settings" in the workspace menu opens `/settings/connections`: the left menu slides to the settings menu, the backdrop turns a shade darker and the page card takes a deeper shadow.
- [ ] The settings menu shows "Back to the app", "Settings", then "Connections" and "Email", with the profile button at the bottom; the open section is highlighted.
- [ ] `/settings` opens `/settings/connections`.
- [ ] "Back to the app" slides back and opens Applications.
- [ ] With the system's reduce motion setting on, the menus swap without sliding.
- [ ] Tab never reaches the menu that is out of view.

## Profile menu

- [ ] As the owner, the profile button shows initials and the email; the menu opens upward with the email and "Sign out".

## Narrow screens

- [ ] At 390 px wide, the menu sits above the page in one row, which scrolls sideways when its items do not fit, with the workspace menu whole and the profile button as an avatar only; Settings swaps the row to "Back to the app", "Connections" and "Email".
