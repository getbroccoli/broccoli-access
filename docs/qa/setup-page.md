# QA: Setup before the owner exists

A manual check of setup held by one browser, which connects Google Workspace with the fake Google, on a development stack.

## Setup

1. Run `pnpm dev --drop-db` to start on a database without an owner.
2. Use two fresh browser profiles, A and B, so no cookie is left over.
3. Keep the seed's client ID and secret from [QA setup](setup.md) at hand.

## Holding setup

- [ ] In A, `/people?q=a`, `/login` and `/nope` each land on `/setup`, without the app's navigation.
- [ ] The sidebar shows "Broccoli Access", "Set up" and the steps "Connect Google Workspace" (current), "Scan your workspace" and "Select your apps"; the tab title ends in "Broccoli Access".
- [ ] In devtools, A has a `broccoli_access_setup` cookie: HttpOnly, SameSite Lax, expiring in three days.
- [ ] In B, any path lands on `/setup/in-progress`, titled "Setup is in progress on another device", with the `docker compose down --volumes && docker compose up` command, and `/setup` goes back to it.
- [ ] Closing and reopening A keeps it on `/setup`.

## Connect Google Workspace

- [ ] The page matches the design: "Step 1 of 3", "Connect Google Workspace", "How to connect" with "Use the Broccoli app" disabled and marked "Coming soon", and "Use your own Google app" selected.
- [ ] The redirect address is `<URL>/api/google/callback`; "Copy" shows "Copied", and the copied text equals the address the fake Google redirects to after consent.
- [ ] The five Google Cloud steps are listed; each link opens Google Cloud in a new tab.
- [ ] "Connect as Google admin" stays disabled until the client ID and secret are both filled in; the secret is masked.
- [ ] A made-up client ID opens the fake Google's "Access blocked: Authorization Error" page.
- [ ] Cancel on the consent page comes back to `/setup` with "You cancelled at Google…"; nobody is signed in.
- [ ] Consenting as Chloé Martin (`chloe@acme.example`, not an admin) comes back to `/setup` with "That Google account isn’t a super admin…"; nobody is signed in.

## After consent

- [ ] Consenting as Mia Novak (`admin@acme.example`) lands on `/setup/scan`: "Step 2 of 3", "Scanning acme.example", "Connected as admin@acme.example…"; the sidebar shows Connect done and Scan current. The `broccoli_access_setup` cookie is gone.
- [ ] "Reading people" spins while "Finding apps people signed in to with Google" and "Reading sign-in logs" show "Waiting"; within a minute, without a reload, all three show a check with "42 people, 2 suspended", "37 apps found" and "Last 6 months read", and the page moves on to Applications.
- [ ] In B, any path now lands on `/login`, which shows "Broccoli Access" and "Acme" and no form.
- [ ] The dev API log holds neither the client secret nor any Google token.

## Select your apps

- [ ] Applications opens on Discovered as on the design: the banner "Last step: select the apps your company uses" with "We found 37 apps…", tabs "Approved 1", "Discovered 37", "Ignored 0", and the left menu's Applications showing 37.
- [ ] The table lists App (logo or initial, name, domain), People (four avatars, then "+N" for the rest), Found via and Since, the most people first; Slack, Notion, Figma, Miro, Loom and Claude are checked, and the button says "Approve 6 and finish".
- [ ] Below the first twelve apps, "Show 25 more apps" shows the rest.
- [ ] Unchecking Claude makes the button "Approve 5 and finish"; checking ChatGPT makes it "Approve 6 and finish". The header checkbox selects all apps, and again none.
- [ ] Reloading keeps the owner on Applications; `/setup`, `/people` and `/` lead back to it.
- [ ] "Approve 6 and finish" opens Approved: Google Workspace and the six selected apps, "Discovered 0", "Ignored 31", no banner and no count in the left menu. Reloading stays there, and `/setup` and `/` open it too.

## Starting over

Start setup in A, then restart the dev stack with `pnpm dev --drop-db`.

- [ ] B, reloaded, now holds setup on `/setup`, and A lands on `/setup/in-progress`.

## Layout

- [ ] On a narrow window, one bar per step replaces the step list, the two ways to connect stack, and nothing scrolls sideways.
- [ ] On a narrow window, the banner's button goes below its text and the app table scrolls sideways inside its frame.
- [ ] Screenshots of `/setup` (desktop and narrow; empty and with an error), `/setup/scan`, `/setup/in-progress` and the first-run Applications page go in the pull request description.
