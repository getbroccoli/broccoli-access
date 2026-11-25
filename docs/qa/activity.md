# QA: Activity

A manual check of the Activity page, which lists every Disable, Enable, Remove and Invite, against a development stack.

## Setup

1. Start the stack on a database without account changes, connect Google Workspace and finish setup as in [QA setup](setup.md). `pnpm dev --drop-db` gives a new one, deleting this checkout's development data.
2. Connect Linear with `lin_api_acme_fake` on its page, and set `FAKE` as "Disable and Enable" in [App page](app-page.md) says, without making its changes.

## Changes that end

- [ ] The left menu shows "Activity" between "People" and the profile button; it opens `/activity` with the title "Activity" and "Every Disable, Enable, Remove and Invite, newest first.".
- [ ] Before any change, the table reads "No Disable, Enable, Remove or Invite yet.".
- [ ] Disable Chloé on Linear's page; the toast's "View in Activity" opens Activity, whose first row reads Chloé Martin with chloe@acme.example, Linear, "Disable", "Mia Novak" and "Today at" the time asked, and "On the server" with a check.
- [ ] After `curl -s -H 'content-type: application/json' -d '{"connector": "linear", "call": "actions/run", "code": "not_allowed", "count": 1}' "$FAKE/_fake/failures"`, disable Ana and open Activity from the left menu: it lists her change first with "Couldn’t disable" in red and "Linear doesn’t allow this change" below, and Chloé's change below it.
- [ ] Ana's "Couldn’t disable" opens "Couldn’t disable Ana Ruiz in Linear" with "Asked by Mia Novak today at <time>.", the reason "Linear doesn’t allow this change. Linear refuses it for some members, such as the workspace’s owner. Nothing changed in Linear.", "Open Linear admin" and "Close", and no Try again or "I did it by hand": those stay on her account's row (see [App page](app-page.md#when-a-change-fails)).
- [ ] With the fake slowed (`curl -s -H 'content-type: application/json' -d '{"milliseconds": 5000}' "$FAKE/_fake/delay"`), confirm a Disable on Linear's page and open Activity from the left menu at once: the change shows as "Disabling in Linear…" with a spinner, then "On the server" without a reload.
- [ ] Invite Ivan Petrov to Linear from his person page (see [A person's page](person-page.md#invite)): Activity's first row reads Ivan Petrov with ivan@acme.example, Linear, "Invite", "Mia Novak" and "Today at" the time asked, and "On the server".
- [ ] Chloé's name opens her person page.

## Removing a disabled account

- [ ] From Hannah Weber’s person page choose Remove on Linear. Check her name, email, the app, the workspace and “This cannot be undone.” Cancel and check she still appears.
- [ ] Confirm “Remove from Linear”. Scan Linear again. Hannah has no Linear account in the fake or on her page, and Activity lists Remove with “On the server”.
- [ ] Connect Slack as "Connect Slack" in [Connections settings](connections-settings.md#connect-slack) says and wait for its first scan. On Slack’s app page disable Elif Demir, then remove her without scanning in between. After Scan now her person page still lists Slack, as “Not in Slack”, through her Google sign-in. Activity lists the Slack removal.
- [ ] Disable an unlinked member in the fake and scan its app. In People → Accounts without a person, open Decide and choose Remove. After confirmation the member leaves the list.

## Narrow screens

- [ ] At 390 px wide, the table scrolls sideways inside its frame and the page itself does not.
