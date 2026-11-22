# QA: Login, logout and the auth gate

A manual check of the sign-in page and signing out against a development stack. Sign in with Google is not built yet.

## Setup

1. Start the stack, connect Google Workspace and move setup on as in [QA setup](setup.md).
2. Use a fresh browser profile, so no session cookie is left over.

## Login

- [ ] `/people?q=a` lands on `/login?redirect=%2Fpeople%3Fq%3Da`, shown without the navigation.
- [ ] The page shows "Broccoli Access" and the organisation "Acme", and no form; `/forgot-password` and `/reset-password` show "Page not found".
- [ ] `/login` while signed in as the owner goes to Today (`/`).

## Logout

- [ ] The profile menu at the bottom left shows "Sign out".
- [ ] "Sign out" lands on `/login?redirect=…` for the current page; Back does not show the previous page.

## Session ends elsewhere

- [ ] Sign out in a second tab, then search in the first: it goes to login with that search as its `redirect`.

## Robustness

- [ ] With the API stopped, a reload shows "Couldn’t reach Broccoli Access"; once it is back, "Try again" opens the page.
- [ ] An unknown path such as `/foo` shows "Page not found" with "Go to Today".
- [ ] At a narrow width the login card fits the screen with its side margin.
