# QA: App frame and menus

A manual check of the left menu, the workspace menu, Settings and the profile menu, against a development stack.

## Setup

1. Start the stack and create the owner as in [QA setup](setup.md).
2. Sign in as `owner@example.com`.

## App menu

- [ ] The left menu shows the workspace menu at the top, "Today" and "People", and the profile button at the bottom.
- [ ] "Today" is highlighted only on Today, not on other pages.
- [ ] The workspace menu opens with "Broccoli Access", then "Settings".

## Settings

- [ ] "Settings" in the workspace menu opens `/settings/email`: the left menu slides to the settings menu, the backdrop turns a shade darker and the page card takes a deeper shadow.
- [ ] The settings menu shows "Back to app", "Settings", then "System" with "Email", with the profile button at the bottom; the open section is highlighted.
- [ ] `/settings` opens `/settings/email`.
- [ ] "Back to app" slides back and opens Today.
- [ ] With the system's reduce motion setting on, the menus swap without sliding.
- [ ] Tab never reaches the menu that is out of view.

## Profile menu

- [ ] As the owner, the profile button shows initials and the email; the menu opens upward with the email and "Sign out".

## Narrow screens

- [ ] At 390 px wide, the menu sits above the page in one row with the profile button as an avatar only; Settings swaps the row to "Back to app" and "Email".
