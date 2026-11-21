# QA: Today

A manual check of the home page against a development stack.

## Setup

1. Start the stack with `pnpm dev --drop-db`.

## Landing

- [ ] Finishing setup ("Create account", see [QA setup](setup.md)) ends on Today (`/`), with "Today" highlighted first in the menu.
- [ ] Signing out and in again without a `redirect` ends on Today.
- [ ] The title reads "Good morning", "Good afternoon" or "Good evening" by the computer's clock (before 12:00, before 18:00, after), with "Here's what's new today." under it and "Nothing new today." below. An employee signed in with an employee record reads "Good morning, {first name}".

## Phone width

- [ ] At 390 px wide, nothing overflows.
