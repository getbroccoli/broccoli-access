# QA: Login, logout and the auth gate

A manual check of the sign-in page, Sign in with Google and signing out against a development stack.

## Setup

1. Start the stack, connect Google Workspace and move setup on as in [QA setup](setup.md).
2. Use a fresh browser profile, so no session cookie is left over.

## Login

- [ ] `/people?q=a` lands on `/login?redirect=%2Fpeople%3Fq%3Da`, shown without the navigation.
- [ ] The page shows the Broccoli Access mark, "Sign in to Acme", "Use your acme.example Google account." and one "Sign in with Google" button, and no password form; `/forgot-password` and `/reset-password` show "Page not found".
- [ ] `/login` while signed in as the owner goes to Today (`/`).

## Sign in with Google

- [ ] "Sign in with Google", then Mia Novak (`admin@acme.example`) and Allow on the fake's consent page, lands on Today (`/`) signed in; a reload keeps the session.
- [ ] Chloe (`chloe@acme.example`) comes back to the sign-in page with "That Google account can’t sign in here." and stays signed out.
- [ ] Cancel on the fake's consent page comes back with "You cancelled at Google. Sign in again when you’re ready."

## Logout

- [ ] The profile menu at the bottom left shows "Sign out".
- [ ] "Sign out" lands on `/login?redirect=…` for the current page; Back does not show the previous page.

## Session ends elsewhere

- [ ] Sign out in a second tab, then search in the first: it goes to login with that search as its `redirect`.

## Robustness

- [ ] With the API stopped, a reload shows "Couldn’t reach Broccoli Access"; once it is back, "Try again" opens the page.
- [ ] An unknown path such as `/foo` shows "Page not found" with "Go to Today".
- [ ] At a narrow width the login card fits the screen with its side margin.
