# QA: Setup before the owner exists

A manual check of setup held by one browser, which creates the owner account, on a development stack.

## Setup

1. Run `pnpm dev --drop-db` to start on a database without an owner.
2. Use two fresh browser profiles, A and B, so no cookie is left over.

## Holding setup

- [ ] In A, `/people?q=a`, `/login` and `/nope` each land on `/setup`, without the app's navigation.
- [ ] The sidebar shows "Broccoli Access" and "Create your account" as the current step; the tab title ends in "Broccoli Access".
- [ ] In devtools, A has a `broccoli_access_setup` cookie: HttpOnly, SameSite Lax, expiring in three days.
- [ ] In B, any path lands on `/setup/in-progress`, titled "Setup is in progress on another device", with the `docker compose down --volumes && docker compose up` command, and `/setup` goes back to it.
- [ ] Closing and reopening A keeps it on `/setup`.

## Owner form

- [ ] "Create account" stays disabled until the email is filled in and the password has 8 characters.
- [ ] `bad` as the email with an 8-character password shows "Enter a valid email address." after submitting.
- [ ] "Generate" fills a 20-character password, shows it in clear text and says "Save this password in your password manager."
- [ ] "Hide" hides it; "Copy" shows "Copied"; typing brings back "Use at least 8 characters."

## After setup

- [ ] Submitting `owner@acme-corp.example` ends on Today (`/`) with the app's navigation; the `broccoli_access_setup` cookie is gone.
- [ ] Reloading Today keeps the owner signed in; `/setup` ends on Today.
- [ ] In B, any path now lands on `/login`; signing in as the owner ends on Today.

## Starting over

Start setup in A, then restart the dev stack with `pnpm dev --drop-db`.

- [ ] B, reloaded, now holds setup on `/setup`, and A lands on `/setup/in-progress`.

## Layout

- [ ] On a narrow window, one bar per step replaces the step list, and nothing scrolls sideways.
- [ ] Screenshots of `/setup` (desktop and narrow; empty, with a generated password, with a field error) and `/setup/in-progress` (desktop and narrow) go in the pull request description.
