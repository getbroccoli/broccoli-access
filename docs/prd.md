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
- Automated provisioning through APIs, SCIM or a robot browser. (later)

## Not goals

- Managed hosting: broccoli-access is self-hosted only.

## Principles

- **Your data stays with you.** Data goes straight from Google and each app to your server.
- **Read before write.** broccoli-access only reads until a later circle adds removing access, and setup asks for read access only.
- **Small working circles.** Each circle ships a small working product with happy paths only. The next circle is planned from what the last one left out.
- **Agents can test everything.** Every journey has an automated check against fake apps. A real test organisation checks the same journeys before a Google change ships.

## How it works

1. Connect Google Workspace as an admin. broccoli-access scans the directory and the apps people signed in to with Google.
2. Select the apps your company uses; the rest are ignored.
3. See each app's people and each person's apps, with flags.
4. Later, connect Slack and more apps to fill in accounts Google cannot see.

## Circles

Planned; each is reshaped when the one before it ends.

1. **See who has access to what:** Google Workspace, apps selected after the scan, and people suspended in Google who still have accounts. See [circle 1](circle1.md).

## Documents

- [Circle 1](circle1.md): scope, setup and testing.
- [Data model](data-model.md): every table, with example rows.
- [Fake apps](fake-apps.md): the fake apps the tests run against.
- [Notes](notes/): decisions and their reasons.
