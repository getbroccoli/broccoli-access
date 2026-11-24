# broccoli-access product requirements

broccoli-access is the open-source SaaS access management app: see who has which account, give joiners their apps, and take them away on a leaver's last day. You run it on your own server.

## Who it is for

The person who looks after a company's tools, at a company of about 10 to 200 people on Google Workspace. Often a founder, an operations lead or a lone IT admin. They have no identity provider project and no time to set up every app.

The first real run is on our own company.

## Problems

- Nobody knows every app the company uses, or who has an account in each.
- Leavers keep accounts after they go, and nobody notices.
- Joiners wait for their apps, and requests get lost in chat messages.

## Goals

- Find the apps and accounts from Google Workspace alone, without setting up each app.
- Show who has which account, and flag the risky ones: people suspended or gone from the directory who still have access, and accounts that belong to nobody.
- Invite, disable, enable and remove accounts in each app through its API or an app session, and let the owner make the change by hand when neither can.
- Give a joiner their apps from templates, and take a leaver's apps away, in one step each.
- Cover the 30 apps small UK companies use most, and keep each connector working when its app changes.

## Not goals

- Managed hosting: broccoli-access is self-hosted only.
- What apps cost: seats, invoices, unused paid seats and cheaper replacements.
- Rules that change accounts with nobody looking. broccoli-access finds every difference; a person fixes it.

## Principles

- **Your data stays with you.** Data goes straight from Google and each app to your server. App keys, sessions and the integration user's secrets are stored there, encrypted.
- **Read before write.** Setup only reads. One Google permission it needs could also revoke an app's grant; broccoli-access never uses it for that. broccoli-access asks Google for write access at the moment the owner first uses a feature that needs it, and only for that feature.
- **A person starts every change.** Every change in an app is one the owner starts and confirms. It is checked in the app afterwards and kept in history.
- **Never get around an app's security.** A connector never hides that it is automated, and never bypasses a CAPTCHA or a bot check. When an app stops it, a person takes over. The integration user passes its own two-step sign-in with its own secret; that is signing in, not getting around.
- **Small working circles.** Each circle ships a small working product with happy paths only. The next circle is planned from what the last one left out.
- **Agents can test everything.** Every journey has an automated check against fake apps. A real test workspace checks each connector before it ships, and every week after.

## How it works

1. Connect Google Workspace as an admin. broccoli-access scans the directory and the apps people signed in to with Google.
2. Select the apps your company uses; the rest are ignored.
3. See each app's people and each person's apps, with flags.
4. Create the integration user, and connect more apps with it, to read their members and to change accounts.
5. Make templates, assign them to people, and provision what is missing.
6. Offboard a leaver: disable every account, then remove the ones that hold a seat.

## How it is built

- **The core** is this repository. It knows no app except Google Workspace, the directory.
- **Connectors** for other apps come from a separate repository, under their own licence. They run as their own container next to the core.
- **A connector method** is how it reaches its app. It takes the first that works on the plans small companies buy, and the owner does not choose:
  1. the app's official API, with a key;
  2. the app's internal API, the calls its own pages make, with an app session;
  3. a robot, which works the app's pages in a browser, where the app ties a session to a real browser.
- **The integration user** is a Google Workspace user that broccoli-access creates for itself, such as `broccoli@acme.example`. The owner makes it an admin in each app, and connectors act as it. An app that blocks automation then blocks the integration user, not the owner. broccoli-access suggests it for every app that needs an app session; the owner's own session stays possible. The notice about an app's terms comes before every connection with an app session, whoever it acts as. Suspending the integration user in Google stops every connector that acts as it.
- **An app session** is a signed-in session in an app. It reaches the instance in one of two ways:
  - **server sign-in:** broccoli-access signs in as the integration user by itself, in a browser on your server, with its stored password and two-step secret. It uses "Sign in with Google" where the app offers it, and otherwise the code or link the app sends to the integration user's mailbox. The owner never signs in as the integration user.
  - **handed over:** the owner signs in to the app in Chrome as themselves, and the extension hands their own session over. No password is stored.
- **The connector factory** is a private repository where agents investigate an app, sign up for a test workspace, explore it, hand the dark factory a connector to build, check it against the real app, and check it again every week. It holds the list of apps with each one's state. The product owner approves the list before any app is investigated, and reads one report per app before its connector ships. An app that needs a person, for a payment, a CAPTCHA or a phone check, is parked, and the agents take the next one.

## Circles

Each is reshaped when the one before it ends. Circles 3 and 4 are planned.

1. **See who has access to what:** Google Workspace, apps selected after the scan, and people suspended in Google who still have accounts. See [circle 1](circle1.md).
2. **Disable and enable accounts:** Slack through the owner's app session and Linear through its API, by hand when automation cannot make the change, and an Activity page of every change. See [circle 2](circle2.md). Invites were added after it.
3. **Give and take away access:** everything we know how to build, in this order. See [circle 3](circle3.md).
   1. **The integration user, Remove, and accounts without a person:**
      - Create the integration user in Google, with write access asked for at that moment.
      - Connect an app by choosing how: the integration user, which is recommended, or the owner's own session. For the integration user, the owner invites it as an admin in the app and presses Connect; broccoli-access accepts the invitation and signs in by itself.
      - Remove an account, to free its seat. It cannot be undone, and the confirmation says so.
      - Accounts without a person: link one to an employee, mark it as a service account or as external with a note, or disable or remove it.
   2. **Templates and differences:**
      - A template is a named list of apps, each with a role. A person can have several, plus their own added and removed apps.
      - Provision invites the person to every app they are missing, and enables a disabled account. An app without a connection is done by hand.
      - Without any template, a person's page still has Invite, Disable, Enable and Remove for each app.
      - A difference is where a person's accounts do not match their templates: missing or extra. broccoli-access lists them; the owner provisions or removes, one click for all.
   3. **Joiners and leavers, with Google:**
      - Add a person who has no Google account yet. Provision creates the Google account first, then the apps.
      - Offboard a person: the Google account and every other account disabled on the click, their templates taken off, and Remove offered afterwards. What broccoli-access cannot do, such as a pending invitation or an app without a connection, is listed as work to do by hand.

   Circle 3 is done with Slack and Linear. Every other app the connector factory has checked by then ships with it.

4. **Robots:** planned after the connector factory has explored real apps.
   - Robots work an app's pages in a browser, for the apps whose sessions are tied to a real browser.

The connector factory runs next to the circles, from now, and is part of neither: the list of 30 apps first, then each app's report, then its connector with the actions the contract has, and each new action when circle 3 adds it.

## Later

- What apps cost.
- Access reviews: the owner confirms or removes each account, app by app, and exports the result for an auditor.
- Access requests from employees, with approvals.
- Offboarding on a set date and time.
- People gone from the directory who still have accounts.
- Changing an account's role, and downgrading a seat.
- Templates suggested from the directory's department or job title.
- People who are not in the directory, such as contractors, as people in broccoli-access.
- Admins in each app, accounts without two-step sign-in, and newly found apps.

## Documents

- [Circle 1](circle1.md): scope, setup and testing.
- [Circle 2](circle2.md): connectors, app sessions, and disabling and enabling accounts.
- [Circle 3](circle3.md): the integration user, Remove, templates, joiners and leavers.
- [Connector contract](connector-contract.md): how the core talks to the connectors container.
- [Data model](data-model.md): every table, with example rows.
- [Fake apps](fake-apps.md): the fake apps the tests run against.
- [Notes](notes/): decisions and their reasons. The roadmap's are in [the roadmap note](notes/2026-11-24-roadmap.md).
