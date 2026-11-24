# Circle 3: give and take away access

At the end of circle 3, the owner removes accounts and sorts out the ones that belong to nobody; creates the integration user and connects Slack with it, with nothing to install; gives a joiner their apps from templates in one step; and offboards a leaver with every account disabled, Google included.

## Rules

- The [circle 1 rules](circle1.md#rules) still hold: happy paths only, simple screens, an automated check for every journey, and the edge cases left out written down for the next circle.
- Only the owner signs in.
- **A person starts every change.** broccoli-access finds every difference between a person's accounts and their templates; it never fixes one by itself.
- **Nothing in the middle needs a person.** Every journey is built and checked against the fakes. What needs a person, a real account or a real app comes last (see "At the end, by a person").
- Circle 3 is done with Slack and Linear. Other connectors ship with it when they are ready.

## How it is built

- **The integration user** is a Google Workspace user that broccoli-access creates for itself. The owner invites it as an admin in each app. Nobody signs in as it by hand, and the owner never sees its password.
- **Server sign-in:** the connectors container signs in as the integration user in its own browser, first to Google, then to the app with "Sign in with Google" where the app offers it, and returns the session. The core holds the integration user's secrets and sends them with that call only. See the [connector contract](connector-contract.md#post-v1connectionssign-in).
- **Two ways to connect an app that needs a session**, chosen in the Connect dialog: the integration user, which is recommended, or the owner's own session, handed over by the extension as in circle 2.
- **Google writes:** setup still only reads. broccoli-access asks Google for the permission to create and change users when the owner first creates the integration user, adds a person or offboards one.
- **Templates** are named lists of apps, each with a role. A person's apps are the apps of their templates, plus the apps the owner added for them, minus the ones the owner removed for them.
- **The connector contract** grows by `remove`, roles on invites, and server sign-in, all additive in v1.

## Journeys

Each journey ends with the check that proves it works. Screens are in the circle 3 design canvas.

### Part 1: remove accounts, and accounts without a person

#### 1. Remove an account

- A disabled account in a connected app has Remove, on the app's page and the person's page. It asks to confirm, naming the person, the app and the workspace, and says that it cannot be undone.
- The connector removes the member and checks that the member is gone. The account leaves broccoli-access and does not come back after a scan.
- A failed remove shows why, with Try again and "I did it by hand", like Disable. Activity lists every remove.
- The connection's own member has no Remove.
- **Done when:** the owner removes a disabled member in Slack and in Linear, each is gone from broccoli-access and from the fake app after a scan, and Activity shows both.

#### 2. Accounts without a person

- People has a tab "Accounts without a person": accounts in approved apps that are linked to no employee and are not marked.
- For each, the owner can:
  - link it to an employee. broccoli-access suggests one when the name or the email's first part is close;
  - mark it as a service account or as external, with a note;
  - disable or remove it.
- A linked account shows on the person's page and stays linked after scans. Marked accounts show under "Marked accounts", where the note can be edited.
- **Done when:** the owner links a Slack account with a private email to its suggested employee, marks one account as a service account and one as external, and the tab's count drops by three.

### Part 2: connect with the integration user

#### 3. Create the integration user

- Settings › Connections says what the integration user is and offers to create it. The owner picks its address.
- Google asks the owner to let broccoli-access create and change users. broccoli-access creates the user with a password it makes and keeps encrypted.
- broccoli-access then signs in to Google as the integration user by itself and sets up its two-step sign-in. If Google shows a check, Connections says "Needs you" with the reason.
- The integration user is not an employee, and its accounts in apps are marked as service accounts.
- **Done when:** the owner creates `broccoli@acme.example`; the fake Google holds the user with two-step sign-in on; Connections shows it as ready; and it is not on the People page.

#### 4. Connect Slack with the integration user

- Connect Slack asks how:
  - **Integration user**, recommended: "In Slack, invite `broccoli@acme.example` as an admin. Then press Connect." No extension is needed.
  - **My own session:** the circle 2 way, with the extension.
- With no integration user yet, the dialog offers to create one.
- After Connect, the dialog shows each step: accept the invitation, sign in to Slack, read the members. The owner can close it.
- Slack then shows "Acts as the integration user", and every change runs as that user. A Slack connection on the owner's own session has Switch.
- When the integration user is not invited, or is not an admin, Connect fails with that reason and what to do.
- **Done when:** the owner connects Slack with the integration user without the extension, the members show, and Disable on a member runs as the integration user.

#### 5. Sessions renew by themselves

- When the integration user's session in an app ends, broccoli-access signs in again and carries on.
- Reconnect shows only when signing in again fails, with the reason: a check that needs a person, or the integration user is no longer an admin.
- **Done when:** an expired session of the integration user in the fake Slack is renewed at the next scan with no Reconnect shown, and a fake Slack that shows a check turns the connection to Reconnect with that reason.

### Part 3: templates and differences

#### 6. Templates

- Templates is in the left menu. The owner creates a template, names it, adds and takes out apps, and picks a role for each app whose connector offers roles.
- A person's page shows their templates. The owner assigns more or takes one off.
- Below, one list shows every app the person should have and every account they have: the role, where the app comes from, and whether it is active, missing, invited or extra.
- For one person only, the owner adds an app no template gives, or removes one a template gives. It can be undone, and the templates do not change.
- When two of a person's templates give one app different roles, the owner picks the role.
- Without any template, a person's page still has Invite, Disable, Enable and Remove for each app.
- **Done when:** the owner creates "Engineer" with Slack and Linear as admin, assigns it and "Everyone" to a new employee, removes one app for them, and the person's page lists the apps of both with Missing on each one they lack.

#### 7. Provision

- A person's page says how many apps are missing and has Provision. It confirms the list, then invites the person to each missing app with its role, and enables an account that was disabled.
- An app without a connection is given by hand and confirmed with "I did it by hand".
- Each app shows its own result. A failed one shows why, with Try again. Activity lists each change, with Provision as where it started.
- **Done when:** the owner provisions a new employee with two templates; the fake Slack and fake Linear each hold one invitation with the template's role; an app without a connection waits for "I did it by hand"; and nothing is missing once the invitations are accepted and a scan runs.

#### 8. Differences

- People has a tab "Differences".
  - **Missing** lists, app by app, the people who should have an app and do not, with one Provision for all of them.
  - **Extra** lists accounts that no template of the person gives, each with Keep or Disable. Keep adds the app for that person only.
- Changing a template, or taking one off a person, changes no account. It shows here, also when it was the person's last template.
- The Templates page marks a template that has differences.
- **Done when:** adding an app to a template shows its people under Missing and one Provision invites them all; taking a template off a person shows their account under Extra; and Keep clears it.

### Part 4: joiners and leavers, with Google

#### 9. Add a person

- People has Add person, for someone with no Google account yet. The owner types the name and the work email and picks templates.
- Provision creates the Google account first, then invites the person to their apps. If the Google account cannot be created, no app is invited.
- The first Google password is shown to the owner once. The person must change it at their first sign-in.
- **Done when:** the owner adds a person with two templates; the fake Google holds the new user; the first password shows once and not again; the apps are invited; and the person is on the People page.

#### 10. Offboard a person

- A person's page has Offboard. It lists every account broccoli-access will disable now, with the Google account first, and what the owner must do by hand: apps without a connection and invitations not yet accepted. The owner can untick an app, then confirms.
- Every account is disabled and the person's templates are taken off. Each app shows its result, and Activity lists each change, with Offboarding as where it started.
- Afterwards the person's page shows what is left for the owner, and Remove on each disabled account in a connected app, with one button for all. The Google account is suspended and never removed here.
- **Done when:** the owner offboards an employee; the fake Google shows them suspended; the fake Slack and fake Linear show them disabled; their page has no templates and lists the by-hand work; "Remove all" removes their Slack and Linear accounts; and no difference shows for them.

## Rules for the integration user

- Never get around an app's security. The connector never hides that it is automated, and never clicks, solves or routes around a CAPTCHA or a bot check. It stops, and the owner sees why.
- Signing in with the integration user's own password and two-step secret is signing in, not getting around.
- "Sign in with Google" first. The integration user's mailbox is used only for an app that has no Google sign-in.
- The integration user's secrets are stored encrypted on the instance, leave it only for the connectors container, and are never in logs, history or answers to the browser.
- Suspending the integration user in Google stops every connector that acts as it.
- The notice about an app's terms comes before every connection with a session, whoever it acts as.

## Testing

- **Core:** tests run against the fake Google, which gains user writes, and the fake connectors container, which gains remove, roles, the two integration user calls and their failures. See [fake apps](fake-apps.md#circle-3).
- **Connectors repository:** it tests the real Slack connector's sign-in in a real browser, against its own fake Google sign-in pages and fake Slack. Its design is approved there before the sign-in connector is built.
- **Both** pass the contract's conformance suite.

## Left out of circle 3

- Robots, for apps whose sessions are tied to a real browser.
- Offboarding on a set date and time.
- Changing an account's role, and a difference for a wrong role.
- Cancelling an invitation from broccoli-access.
- Templates suggested from the directory's department or job title.
- People who are not in the directory, as people in broccoli-access.
- Access reviews, access requests, and what apps cost.
- Org units, groups and aliases for a Google account broccoli-access creates.
- People gone from the directory who still have accounts.

## Before circle 3 starts

- **Data model:** the [circle 3 section](data-model.md#circles-3-and-4-proposed) is approved.
- **Screens:** the circle 3 design canvas is approved.
- **Connector contract and fake apps:** the changes in this pull request are approved with it.

## At the end, by a person

Everything that needs a person, a real account or a real app comes last, once every journey passes against the fakes:

- Regression QA of every journey.
- The journeys on a real test Google Workspace with real Slack and Linear test workspaces: create the integration user, connect Slack with it, provision a test person from a template, offboard them and remove their accounts. The fakes are fixed wherever the real apps differ.
- The answers still open: whether Google lets broccoli-access set up and use the integration user's two-step sign-in, and whether Google and Slack keep accepting its sign-ins over several days.

Reasons are in [the roadmap note](notes/2026-11-24-roadmap.md).
