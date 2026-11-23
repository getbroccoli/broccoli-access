# Circle 2: disable and enable accounts

At the end of circle 2, the owner connects Slack and Linear, sees their members, and disables or enables a person's account in either app from broccoli-access. When automation cannot make the change, the owner sees why, and can try again or make it by hand. An Activity page lists every change.

## Rules

- The [circle 1 rules](circle1.md#rules) still hold: happy paths only, simple screens, an automated check for every journey, and the edge cases left out written down for circle 3.
- Only the owner signs in, and they must be an admin in Slack and in Linear.

## How it is built

- **The core** is this repository. It knows no app except Google Workspace, the directory. It holds the connector contract, app connections, account changes, history and every screen.
- **The connectors** for other apps live in a separate repository, under their own licence. They ship as their own container image, which `docker-compose.yml` runs next to the core. The container keeps nothing between calls: each call carries the connection, and returns any renewed session for the core to save. Circle 2 has two:
  - Linear, through its API;
  - Slack, through the web methods Slack's own admin pages call, with the owner's app session.
- **The [connector contract](connector-contract.md)** grows from reading to writing. It is HTTP with JSON between the core and the connectors container:
  - each connector's capabilities: `suspend` and `reactivate` in circle 2;
  - each action reads the member again afterwards and returns the status it saw, or an error;
  - where each connector can run: on the server for both in circle 2. The contract already names the owner's browser as a second runtime, for a later app that needs a robot.
- **The extension** for Chrome is public and installed from the Chrome Web Store. It pairs with the instance and hands over the owner's app session. It holds no steps for any app: what to collect comes from the connector's manifest, so a new app needs no new extension.

## Journeys

Each journey ends with the check that proves it works.

### 1. Connect Linear

- Settings > Connections > Connect Linear. The owner pastes a personal API key made by a Linear admin.
- broccoli-access shows the workspace name, approves the Linear app and scans its members. Each member becomes an app account, found via "Linear", with its status.
- **Done when:** after the key is pasted, the fake Linear's members show on Linear's app page with their status.

### 2. Connect Slack

- Connect Slack first asks for the extension: a link to the Chrome Web Store, then pairing with this instance.
- Before the first connection, a notice says Slack's terms may not allow automation. The owner accepts it for Slack.
- The owner signs in to Slack in their own Chrome as usual, with SSO and MFA, and presses Connect Slack in broccoli-access.
- The extension sends only Slack's cookies and the token Slack's signed-in page keeps to the instance, which stores them encrypted like every connection secret. broccoli-access never sees or stores a password or an MFA secret.
- On the server, the Slack connector reads the members and their status with Slack's own web methods. broccoli-access shows the workspace name and approves the Slack app.
- **Done when:** in a browser-journey test, the real extension hands over a session from the fake Slack, and the scan lists the fake Slack's members.

### 3. Disable and enable an account

- An app's page and a person's page show:
  - Disable on each active account in a connected app;
  - Enable on each suspended one.

  "Suspended with access" leads to them. A suspended account in a connected app shows as "Disabled", matching the buttons.

- Disable and Enable both ask to confirm, naming the person, the app and the workspace.
- The change runs on the server: Linear's API, or Slack's own web methods with the stored session.
- When it cannot, the change fails. The account shows "Couldn't disable" with the reason, Try again, a link to the app's admin page, and "I did it by hand". When the app refuses the change (`not_allowed`) or the member is gone (`account_not_found`), Try again is hidden because it cannot help; for a member who is gone, Scan now is offered instead.
- Before it acts, the connector checks the workspace and the member. Afterwards it reads the member again. A member it cannot find is a failure, never a success.
- Each change that succeeds, and each one done by hand, adds a history line on the app account, with the owner as the change author.
- The Activity page lists every Disable and Enable, newest first: the person and the app, who asked and when, and how it ended: on the server, by hand, or not at all.
- **Done when:** disabling and enabling an account works on the server and by hand after a failure, for Slack and for Linear, and each shows on Activity.

### 4. Keep connections working

- Every connection is scanned every day. For Slack, the scan also renews the stored session.
- When a key or session stops working, the connection shows Reconnect in Settings and on the app's page, and its accounts show Reconnect instead of Disable and Enable. A change already running fails with Reconnect as the reason.
- Reconnecting Slack takes two clicks while the owner is signed in to Slack in Chrome: Reconnect, then Hand over in the extension's window.
- **Done when:** an expired session in the fake Slack turns the connection to Reconnect, Slack's accounts show Reconnect instead of Disable, and reconnecting brings Disable back.

## Rules for app sessions

- Never get around an app's security: never hide the automation, and never bypass MFA, CAPTCHA or bot checks. When an app stops a connector, a person takes over.
- Make only the calls the app's own pages make, one change at a time, as the owner would.
- Each app used through an app session is the owner's choice, made after its notice. The owner can disconnect it at any time.
- The status an app's own connector read wins: a Google sign-in never marks a suspended account active again.

## Testing

- **Core:** tests run against the fake Google plus a fake connectors container. It speaks the contract, with Acme's members in Slack and Linear and a Slack sign-in page to test the extension's hand-over. See [fake apps](fake-apps.md#fake-connectors-container).
- **Connectors repository:** it tests its connectors without the core.
  - A harness calls the container directly.
  - Each connector is tested against a fake of its app: the fake Linear API and the fake Slack web methods.
- **Both:** pass the contract's conformance suite.
- **Real workspaces, at the end, by a person.** They:
  - set up free test workspaces in Slack and Linear, with three test members each;
  - hand over the Slack session once.

  Then the journeys run against the real workspaces, disabling and enabling a test member on the server. It also answers:
  - how long a Slack session lasts on a server, and whether the daily scan keeps it alive;
  - whether Slack accepts its own web methods from a server with the handed-over session;
  - whether the free plans let an admin deactivate a member in Slack and suspend one in Linear.

  Their runs of the connectors repository's real checks use `--verbose`, which keeps every call to the app. An agent compares those calls with the same run against the fakes, and the fakes are fixed wherever the real apps differ.

## Left out of circle 2

These are the input for circle 3:

- Inviting people, removing or deleting accounts, and changing roles.
- More apps on the same contract, and SCIM for apps on enterprise plans.
- Robots that work an app's pages, and running a change in the owner's Chrome when the server cannot.
- Joiners and leavers: every account disabled on a leaver's last day, bulk actions, and a brake on mass changes.
- A dedicated integration account instead of the owner's own session.
- Other admins and app owners connecting apps.
- Several Slack workspaces, and Slack Enterprise Grid.
- Slack members whose email matches no employee.
- What circle 1 left out that circle 2 does not cover:
  - scan failures other than Reconnect;
  - people gone from Google;
  - several Google domains;
  - CSV uploads and apps added by hand;
  - when each app was last used.

## Before circle 2 starts

- **Connector contract:** [it](connector-contract.md) is approved.
- **Data model:** it adds account changes, extension pairings, and the Slack and Linear connections, and is approved together with the fake apps design for Slack and Linear.
- **Screens:** the circle 2 design canvas is approved before the first task with a screen.

## At the end, by a person

Everything that needs a person comes last, once every journey passes against the fakes:

- the check against real Slack and Linear test workspaces;
- publishing the extension to the Chrome Web Store, and the connectors image where `docker-compose.yml` can pull it.

Until then, tests load the extension unpacked and build the connectors image locally.

Reasons are in [the circle 2 note](notes/2026-11-22-circle-2.md).
