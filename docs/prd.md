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
- Show who has which account, and flag the risky ones: people suspended or gone from the directory who still have access.
- Disable and enable accounts in each app through its API, SCIM or the owner's app session, and let the owner make the change by hand when none of them can.

## Not goals

- Managed hosting: broccoli-access is self-hosted only.

## Principles

- **Your data stays with you.** Data goes straight from Google and each app to your server. App keys and sessions are stored there, encrypted.
- **Read before write.** Setup asks for read access only. Every change in an app is one the owner starts and confirms. It is checked in the app afterwards and kept in history.
- **Never get around an app's security.** A connector never hides that it is automated, and never bypasses MFA, CAPTCHA or bot checks. When an app stops it, a person takes over.
- **Small working circles.** Each circle ships a small working product with happy paths only. The next circle is planned from what the last one left out.
- **Agents can test everything.** Every journey has an automated check against fake apps. A real test organisation checks the same journeys before a Google change ships.

## How it works

1. Connect Google Workspace as an admin. broccoli-access scans the directory and the apps people signed in to with Google.
2. Select the apps your company uses; the rest are ignored.
3. See each app's people and each person's apps, with flags.
4. Connect more apps, such as Slack and Linear, to read their members and to disable or enable accounts.

## How it is built

- **The core** is this repository. It knows no app except Google Workspace, the directory.
- **Connectors** for other apps come from a separate repository, under their own licence. They run as their own container next to the core, and use an app's API, SCIM or the owner's app session.
- **An app session** is the owner's own signed-in session in an app, handed over by the broccoli-access extension for Chrome. With it, a connector makes the calls the app's own pages make, for an app without a public API on the company's plan.

## Circles

Planned; each is reshaped when the one before it ends.

1. **See who has access to what:** Google Workspace, apps selected after the scan, and people suspended in Google who still have accounts. See [circle 1](circle1.md).
2. **Disable and enable accounts:** Slack through the owner's app session and Linear through its API, by hand when automation cannot make the change, and an Activity page of every change. See [circle 2](circle2.md).

## Documents

- [Circle 1](circle1.md): scope, setup and testing.
- [Circle 2](circle2.md): connectors, app sessions, and disabling and enabling accounts.
- [Connector contract](connector-contract.md): how the core talks to the connectors container.
- [Data model](data-model.md): every table, with example rows.
- [Fake apps](fake-apps.md): the fake apps the tests run against.
- [Notes](notes/): decisions and their reasons.
