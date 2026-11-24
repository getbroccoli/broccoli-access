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

## Robustness

- [ ] `/templates/not-an-id` shows the not-found page.
- [ ] With the API failing, Templates shows "Couldn’t load templates" and "Try again" reloads it once the API is back.
- [ ] At 390 px wide the buttons wrap under the title and the tables stay inside their frames.
