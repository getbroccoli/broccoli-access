# QA: Templates

A manual check of the Templates page and a template's page against a development stack: create a template, name it, add and take out apps, rename it and delete it.

## Setup

1. Start the stack, connect Google Workspace as `admin@acme.example`, and finish setup with the six preselected apps ("Approve 6 and finish") as in [QA setup](setup.md).
2. On Applications, connect Linear with the key `lin_api_acme_fake`, so Slack and Linear are both approved.

## Templates

- [ ] The left menu shows "Templates" between "People" and "Activity"; it opens `/templates` and is highlighted there and on a template's page.
- [ ] With no template, the table shows "No templates yet." under the columns "Template", "Apps" and "People".
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

- [ ] Add Linear to Engineer. Under Role, choose Admin. Reload Engineer and check that Admin is still selected. An app without a connection shows "By hand".
- [ ] Give Engineer to Ivan Petrov. His Linear row shows Admin from Engineer.
- [ ] Add Linear to a second template, Design, leave its role at User and give Design to Ivan. His Linear row offers "Pick a role…" and names the source template for each option. Invite disappears until he has a role.
- [ ] Pick "Admin, from Engineer", then invite Ivan to Linear. His row shows Admin and becomes Invited. In the fake connectors' `GET /_fake/state`, Ivan's Linear invitation has the role `admin`.
