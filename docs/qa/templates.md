# QA: Templates

A manual check of the Templates page and a template's page against a development stack: create a template, name it, add and take out apps, rename it and delete it.

## Setup

1. Start the stack, connect Google Workspace as `admin@acme.example`, and finish setup with Slack preselected ("Approve 1 and finish") as in [QA setup](setup.md).
2. On Applications, connect Linear with the key `lin_api_acme_fake`, so Slack and Linear are both approved.

## Templates

- [ ] The left menu shows "Templates" between "People" and "Activity"; it opens `/templates` and is highlighted there and on a template's page.
- [ ] With no template, the table shows "No templates yet." under "Template", "Apps", "People" and "Differences".
- [ ] "New template" opens a dialog with the field "Name". "Create template" with an empty name shows "Give the template a name."; Cancel closes it.
- [ ] Creating "Engineer" opens its page, `/templates/<id>`. Back on Templates, the row shows "Engineer", "No apps yet" and 0.
- [ ] Creating "engineer" shows "Another template already has this name." and the dialog stays open.
- [ ] After creating "analyst" too, Templates lists "analyst" before "Engineer": by name, ignoring case. A name opens its page.

## A template's page

- [ ] The page shows "Templates" as the way back, the name with "Rename" and "Delete", "Apps" with "Add app", and "People with this template 0" with "Nobody has this template yet."
- [ ] "Add app" lists the approved apps that are not in the template. Choosing Slack, then Linear, adds each as a row in that order, and each leaves the menu.
- [ ] "Rename" opens the dialog with the current name; saving "Developer" changes the title, and a reload keeps it.
- [ ] "Take out" on Linear removes its row and offers Linear in "Add app" again; a reload keeps Slack only.
- [ ] Templates shows "Developer" with "Slack" and 0.
- [ ] "Delete" asks "Delete Developer?" and says no account changes; confirming opens Templates without it, and its old address shows the not-found page.

## People with this template

1. Create an Onboarding template and assign it to seven active people, one at a time. Open Onboarding. The count is seven, with the first six people visible in assignment order.
2. In a second tab, take Onboarding off the first visible person and assign it to them again. Leave the original template page open.
3. Record GraphQL requests in the Network panel. Fail the next people-page read once using a local test proxy, then choose the control to show more people. The first six chips stay visible. The message identifies that loading **more people with this template** failed and offers a retry.
4. Restore the connection and retry. Inspect the continuation request. It uses the first page's end cursor and asks only for the template's people and their page information. It omits the template's apps and the approved-app catalog. The seventh person appears, the reassigned person has one chip, and all seven link to their own pages. The continuation control disappears after the final page.

## Robustness

- [ ] `/templates/not-an-id` shows the not-found page.
- [ ] With the whole API down, opening Templates shows the app-wide "Couldn’t reach Broccoli Access" with "Try again", as every page does.
- [ ] When only the templates request fails, the page shows "Couldn’t load templates" under its title, and "Try again" loads the list. To fail that request once, open People, run this in the browser's console, then open Templates from the menu:

  ```js
  const send = window.fetch;
  window.fetch = (url, options) => {
    if (!String(options?.body).includes("TemplatesPage")) return send(url, options);
    window.fetch = send;
    return Promise.reject(new TypeError("Failed for QA"));
  };
  ```

- [ ] At 390 px wide the buttons wrap under the title and the tables stay inside their frames.

## Invite with a template role

- [ ] Create Engineer and Design if they are missing. Add Linear and disconnected Slack to Engineer. Slack’s Role cell reads “Not connected”. Choose Admin for Linear, reload Engineer, and check that Admin is still selected.
- [ ] Give Engineer to Ivan Petrov. Under **Role**, his Linear row shows Admin from Engineer. Open Invite, check that the confirmation names Ivan, Linear and Admin, then cancel.
- [ ] Give Ivan Design with Linear set to its default. The conflict names both source templates and blocks Invite. Choose Default and open Invite again. The confirmation identifies the app default. Cancel.
- [ ] Take Design off Ivan. Open Invite, confirm Admin, and check Ivan’s Linear invitation in the fake connectors’ `GET /_fake/state` for the role `admin`.
- [ ] Repeat the conflict with Chloé, who already has a Linear account. At the picker, check that the guidance explains that the choice applies to future invites. Pick Admin. The picker goes, her Role cell reads "—", since an account keeps the role it has in its app, and her member role in the fake stays the same. On a person with a queued invite, changing the expected role also preserves the role on that invitation when it arrives.

## Role changes across tabs and connector updates

Use a local test proxy for the delayed responses below. Hold only the named response so other requests can finish. For a changed manifest, restart the development API to clear its manifest cache while leaving the browser tab open. Restore the original manifest after each case.

- [ ] Give Ivan three Linear sources granting Default, Guest and Admin. Submit Admin and hold the successful pick response after the server commits. In another tab take off the Admin template. Refetch Ivan’s apps in the first tab. Once it shows the Default/Guest conflict, release the old response. The conflict stays visible and Invite stays blocked.
- [ ] With Default and Admin sources, open the conflict picker while User is the manifest default. Change the manifest so Admin is the default and User is non-default. Pick Admin in the still-open picker. Check the saved role in the response and the row before reloading. A saved null appears as the app default and agrees with a fresh read.
- [ ] With Default and Admin sources and no saved pick, remove Linear’s role list from the manifest, keeping Invite available. As owner, open Ivan’s conflict, pick Default, and reload. The conflict clears and the expected role stays Default.
- [ ] With Admin and Guest sources and no saved pick, remove Linear’s role list. As a non-owner workspace admin, open the conflict. The row directs you to ask an owner to update one of the assigned templates. As owner, confirm the guidance identifies a template edit as the way to restore an available role.
- [ ] Put connected Linear in Engineer and take Slack out. Hold the first connector manifest response. Open Engineer. Its name and Linear row appear while role options are pending. Add disconnected Slack and check its row appears before releasing the response. Release it and check Linear’s role options load.
- [ ] Open Engineer in two tabs with Linear present and Slack absent. Add Slack in the second tab, then save Linear’s role in the first. Check the first tab still renders usable app rows with names and controls. Reload and verify both Slack and the saved Linear role.
- [ ] Fail a queued Linear invite by retiring its role before the worker runs. Remove the source template, then open that failure in Activity. The reason describes what happened to the recorded invite. It neither attributes the failure to the person’s current templates nor promises a retry.
