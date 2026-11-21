# Circle 1: see who has access to what

At the end of circle 1, an admin sets up broccoli-access by connecting Google Workspace, selects the company's apps, and sees each app's people and each person's apps. People suspended in Google who still have accounts are flagged.

## Rules

- Happy paths only, with simple screens.
- Every journey has an automated check against the fake apps.
- The [data model](data-model.md) covers the whole product, and the [fake apps](fake-apps.md) cover every connected app.
- The edge cases left out are written down below, as the next circle's input.

## Journeys

Each journey ends with the check that proves it works.

### 1. Set up with Google Workspace

The setup page has three steps: Connect Google Workspace, Scan your workspace, Select your apps.

- **Connect Google Workspace.** Two choices:
  - **Use the Broccoli app:** one click. Shown as "Coming soon".
  - **Use your own Google app:** the page shows this instance's redirect address with a Copy button, links to the five steps in Google Cloud, and fields for the client ID and secret. The steps are: create a project, turn on the Admin SDK API, set up an Internal consent screen, create a Web application OAuth client with the redirect address, and paste its client ID and secret.
- **Connect as Google admin.** A super admin approves read access to users, their app access, the organisation and audit logs. They come back signed in as the owner.
- **Done when:** after consent, the owner is signed in and the scan has started.

### 2. Scan and select your apps

- The scan shows its progress: people read, apps found, and sign-in logs read for the last 6 months.
- Then the Applications page opens on the Discovered tab with a banner: "Last step: select the apps your company uses". Each app shows its people, how it was found, and since when ("Before <date>" when the grant is older than Google's log). The biggest apps are selected; the owner changes the selection and presses "Approve n and finish".
- Google Workspace itself is approved when it is connected.
- **Done when:** the selected apps are approved, every other app is ignored, and setup is done.

### 3. Applications

- Tabs: Approved, Discovered, Ignored, each with its count. "Scanned today at 08:00" and a "Scan now" button.
- Each app shows its users, how they were found ("Google directory" or "Google sign-in"), and how many people suspended in Google still have access.
- An app's page shows its users with their status, how each was found and since when, and an Ignore button. An app in Discovered or Ignored can be approved.
- **Done when:** approving or ignoring an app moves it between tabs and updates the counts.

### 4. People

- Tabs: All and "Suspended with access", with a search. Each person shows their status and their apps.
- A person's page shows their status, a warning when they are suspended in Google but still have accounts, and their current access: each approved app, how it was found and since when.
- The People item in the sidebar shows the number of people suspended with access.
- **Done when:** a person suspended in the fake Google with accounts in approved apps appears in "Suspended with access", with the right count in the sidebar.

### 5. Sign in

- After setup, the owner signs in with Google. There is no password, and in circle 1 only the owner signs in.
- Settings has two tabs, Connections and Email. Connections shows Google Workspace with its domain, admin, last scan, "Scan now" and "Change Google app".
- **Done when:** the owner signs out, signs in with Google and lands on Applications.

## Testing

- `packages/fake-apps` holds a fake Google serving a seeded company, Acme. `pnpm dev` runs the app against them, so automated tests and everyday manual checks need no real account.
- Every task is tested against the fake Google, with no person in the loop.
- The circle's last task checks the same journeys against a real test organisation on Google Cloud Identity Free (free, up to 50 users) and fixes the fake wherever real Google differs. A person sets the organisation up once; scans with its stored token then run unattended.

## Left out of circle 1

These are the input for circle 2:

- Scan failures: access revoked, a missing permission, rate limits, an app that does not answer.
- People who disappear from Google, and accounts whose email matches nobody, such as email aliases.
- Several Google domains in one organisation, and very large directories.
- Connecting Slack, CSV uploads, apps added by hand, and API connectors.
- When each app was last used.
- Scans every day.
- Inviting other admins or app owners.

## Before circle 1 starts

- The data model and the fake apps design are approved.
- The Broccoli copy is the first task: current Broccoli `main` with fresh history, minus everything in [what to remove](notes/2026-11-20-what-to-remove.md).
