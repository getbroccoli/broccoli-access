# QA: Activity

A manual check of the Activity page, which lists every Disable and Enable, against a development stack.

## Setup

1. Start the stack, connect Google Workspace and finish setup as in [QA setup](setup.md).
2. Connect Linear with `lin_api_acme_fake` and follow "Disable and Enable" in [App page](app-page.md) for its `FAKE` address.

## Changes that end

- [ ] The left menu shows "Activity" between "People" and the profile button; it opens `/activity` with the title "Activity" and "Every Disable and Enable, newest first.".
- [ ] Before any change, the table reads "No Disable or Enable yet.".
- [ ] Disable Chloé on Linear's page; the toast's "View in Activity" opens Activity, whose first row reads Chloé Martin with chloe@acme.example, Linear, "Disable", "Mia Novak" and "Today at" the time asked, and "On the server" with a check.
- [ ] After `curl -s -H 'content-type: application/json' -d '{"connector": "linear", "call": "actions/run", "code": "not_allowed", "count": 1}' "$FAKE/_fake/failures"`, disable Ana: Activity lists it first with "Couldn’t disable" in red and "Linear doesn’t allow this change" below, and Chloé's change below it.
- [ ] With the fake slowed (`curl -s -H 'content-type: application/json' -d '{"milliseconds": 5000}' "$FAKE/_fake/delay"`), a Disable asked on Linear's page shows on Activity as "Disabling in Linear…" with a spinner, then "On the server" without a reload.
- [ ] Chloé's name opens her person page.

## Narrow screens

- [ ] At 390 px wide, the table scrolls sideways inside its frame and the page itself does not.
