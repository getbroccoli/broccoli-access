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

## Connect Google Workspace with the fake Google

- [ ] Start shared Google setup through the intended public HTTPS address without `SELF_HOSTED_PUBLIC_URL`, including behind TLS termination. Later sign-in uses that same callback address. An explicit `SELF_HOSTED_PUBLIC_URL` override uses the configured address instead.
- [ ] With `GOOGLE_RELAY_URL` explicitly empty, "Use the Broccoli app" is disabled and marked "Coming soon", and "Use your own Google app" is selected.
- [ ] With a configured relay, the Broccoli app is selected. Its copy explains that Google’s keys pass through the relay while directory data goes directly to this server. Credential fields appear only after choosing your own app.
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
- [ ] The table lists App (logo or initial, name, domain), People (four avatars, then "+N" for the rest), Found via and Since, the most people first. Only Slack starts checked. The button says "Approve 1 and finish".
- [ ] Slack is the only app with "Manageable" after its name. Its link has the description "Broccoli Access can manage accounts in this app once you connect it."
- [ ] Below the first twelve apps, "Show 25 more apps" shows the rest.
- [ ] Unchecking Slack leaves its chip visible and makes the button "Approve 0 and finish". Checking ChatGPT leaves it without a chip and makes the button "Approve 1 and finish". The header checkbox selects all apps, and again none. Select Slack again to continue.
- [ ] Reloading keeps the owner on Applications; `/setup`, `/people` and `/` lead back to it.
- [ ] "Approve 1 and finish" opens Approved with Google Workspace and Slack approved. The tabs show "Discovered 0" and "Ignored 36". The banner and the left menu's count are gone. Reloading stays there, and `/setup` and `/` open it too.

## Starting over

Start setup in A, then restart the dev stack with `pnpm dev --drop-db`.

- [ ] B, reloaded, now holds setup on `/setup`, and A lands on `/setup/in-progress`.

## Layout

- [ ] On a narrow window, one bar per step replaces the step list, the two ways to connect stack, and nothing scrolls sideways.
- [ ] On a narrow window, the banner's button goes below its text and the app table scrolls sideways inside its frame.
- [ ] Screenshots of `/setup` (desktop and narrow; empty and with an error), `/setup/scan`, `/setup/in-progress` and the first-run Applications page go in the pull request description.

- [ ] If the first scan fails, Scan now retries it. An authentication failure also offers Reconnect; its Google app page opens while unrelated Settings pages remain unavailable until setup finishes.

## Shared Google app with real Google

Use a separate fresh instance with a configured relay and Google's real OpenID and Directory endpoints. A human workspace super admin completes Google's consent.

- [ ] Choose the Broccoli app, confirm the destination host and allow Google's requested permissions. The callback signs in the owner and starts the first scan. No grant to the Broccoli app appears among discovered apps.
- [ ] After a successful connection, finish setup, log out and sign in through the same Google app.
- [ ] On a separate fresh instance, cancelling consent saves no connection and signs nobody in.
