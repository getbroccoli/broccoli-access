/** English copy under `settings.*`. */
export const settingsEn = {
  "settings.title": "Settings",
  "settings.connections.title": "Connections",
  "settings.connections.description": "Where Broccoli Access finds your people and their accounts.",
  "settings.connections.broccoliApp": "Broccoli app",
  "settings.connections.ownApp": "Your Google app: {clientId}",
  "settings.connections.googleWorkspace": "Google Workspace",
  "settings.connections.connected": "Connected",
  "settings.connections.summary": "{domain}, connected as {email}.",
  "settings.connections.googleReconnect":
    "Google access needs renewing. Reconnect as a super admin, then choose Scan now.",
  "settings.connections.scanFailed": "The last scan failed. Try Scan now again.",
  "settings.connections.changeApp": "Change Google app",
  "settings.connections.loadFailed": "Couldn’t load the connections.",
  "settings.connections.retry": "Try again",
  "settings.connections.readsOnly": "Reads only",
  "settings.connections.canChangeUsers": "Can create and change users",
  "settings.integrationUser.section": "Integration user",
  "settings.integrationUser.offerTitle": "Give Broccoli Access its own user",
  "settings.integrationUser.offerBody":
    "An integration user is a separate Google Workspace account, such as broccoli@{domain}, that Broccoli Access signs in to your apps with. It creates, changes and removes accounts as this user, not with your own session.",
  "settings.integrationUser.offerBlocks":
    "If an app blocks automation, it blocks this user, not you.",
  "settings.integrationUser.offerKeepsWorking": "Keeps working when you are signed out or away.",
  "settings.integrationUser.offerSuspend": "Suspend it in Google to stop everything at once.",
  "settings.integrationUser.needsOwnGoogleApp":
    "Creating it needs your own Google app. Change the Google app above first.",
  "settings.integrationUser.create": "Create integration user",
  "settings.integrationUser.created": "Created",
  "settings.integrationUser.openInGoogleAdmin": "Open in Google admin",
  "settings.integrationUser.settingUp": "Setting up",
  "settings.integrationUser.needsYou": "Needs you",
  "settings.integrationUser.settingUpSummary":
    "Broccoli Access is signing in to Google as this user and setting up its two-step sign-in.",
  "settings.integrationUser.signedInSummary": "Signed in to Google · Two-step sign-in on",
  "settings.integrationUser.blockedByCheck":
    "Google showed a check that needs a person, so Broccoli Access stopped signing in. It never gets around a check. Try again later.",
  "settings.integrationUser.authenticationFailed":
    "Google refused this user’s password or two-step code. Check in Google admin that the user is active, then try again.",
  "settings.integrationUser.connectorsUnavailable":
    "Broccoli Access couldn’t sign in through the connectors container. Check that it is set up and running, then try again.",
  "settings.integrationUser.signInDidNotFinish":
    "Broccoli Access couldn’t finish signing in to Google as this user. Try again.",
  "settings.integrationUser.tryAgain": "Try again",
  "settings.integrationUser.tryAgainFailed": "Couldn’t start signing in. Try again.",
  "settings.integrationUser.dialogTitle": "Create the integration user",
  "settings.integrationUser.address": "Its email address",
  "settings.integrationUser.dialogNote":
    "Google will ask you to allow creating users. This uses one paid Google seat.",
  "settings.integrationUser.cancel": "Cancel",
  "settings.integrationUser.continueToGoogle": "Continue to Google",
  "settings.integrationUser.invalidAddress":
    "Use letters and digits, with single dots, hyphens or underscores between them.",
  "settings.integrationUser.startFailed": "Couldn’t go to Google. Try again.",
  "settings.integrationUser.cancelled": "You cancelled at Google. No integration user was created.",
  "settings.integrationUser.permissionRefused":
    "Google didn’t get your permission to create users, so no integration user was created. Try again and allow it.",
  "settings.integrationUser.emailTaken":
    "That address is already used in your Google Workspace. Pick another one.",
  "settings.integrationUser.failed": "Couldn’t create the integration user. Try again.",
  "settings.extension.section": "Chrome extension",
  "settings.extension.name": "Broccoli Access for Chrome",
  "settings.extension.notInstalled": "Not installed",
  "settings.extension.notPaired": "Not paired",
  "settings.extension.paired": "Paired",
  "settings.extension.description":
    "Hands over your Slack session when you connect or reconnect Slack. Nothing else.",
  "settings.extension.pairedSummary": "{browser}, paired on {day}.",
  "settings.extension.pairedNote":
    "Hands over your Slack session when you connect or reconnect Slack.",
  "settings.extension.download": "Download the extension",
  "settings.extension.stepUnzip":
    "Unzip it into a folder you keep. Deleting the folder removes the extension.",
  "settings.extension.stepOpen": "Open Chrome’s extensions page in a new tab:",
  "settings.extension.stepDeveloperMode": "Turn on Developer mode.",
  "settings.extension.stepLoadUnpacked":
    "Choose Load unpacked and pick that folder, the one holding manifest.json.",
  "settings.extension.stepComeBack": "Come back here. This page finds the extension by itself.",
  "settings.extension.managedChrome":
    "A company-managed Chrome may block Developer mode or extensions it doesn’t know. Then ask your IT team to allow Developer mode and this extension’s ID:",
  "settings.extension.downloadNeedsHttps":
    "Open Broccoli Access at its https address to download the extension: over plain http, someone on the network could swap it.",
  "settings.extension.updateNote":
    "It doesn’t update itself. After updating Broccoli Access, download it again, unzip it over the same folder and press its Reload in chrome://extensions.",
  "settings.extension.id": "the extension’s ID",
  "settings.extension.copy": "Copy",
  "settings.extension.copied": "Copied",
  "settings.extension.copyName": "Copy {name}",
  "settings.extension.copiedName": "Copied {name}",
  "settings.extension.copyFailed": "Couldn’t copy. Select the text and copy it manually.",
  "settings.extension.pair": "Pair this Chrome",
  "settings.extension.needsHttps":
    "Pairing needs HTTPS: open Broccoli Access at its https address to pair this Chrome.",
  "settings.extension.confirmInPopup": "Chrome shows the extension’s popup for you to confirm.",
  "settings.extension.pairFailed": "Couldn’t start pairing. Try again.",
  "settings.extension.windowBlocked":
    "Chrome blocked the pairing window. Allow pop-ups for this site, then try again.",
  "settings.extension.loadFailed": "Couldn’t load this Chrome’s pairing.",
  "settings.extension.unpairFailed": "Couldn’t unpair. Try again.",
  "settings.extension.unpair": "Unpair",
  "settings.connections.directory": "Directory",
  "settings.apps.title": "Apps",
  "settings.apps.description":
    "Connect an app to see its members, and disable or enable their accounts from here.",
  "settings.apps.descriptionMixed":
    "Connect apps to see their members and manage access where supported.",
  "settings.apps.notConnected": "Not connected",
  "settings.apps.throughApi": "Through {app}’s API, with a {field} made by a {app} admin.",
  "settings.apps.throughAppSession":
    "{app} has no API for this on your plan, so Broccoli Access makes the calls {app}’s own admin pages make, with your {app} session. The Chrome extension hands it over.",
  "settings.apps.throughIntegrationUser":
    "{app} has no API for this on your plan, so Broccoli Access makes the calls {app}’s own admin pages make, with a {app} session: the integration user’s, or your own.",
  "settings.apps.connect": "Connect {app}",
  "settings.apps.summary": "The {workspace} workspace, connected with a {field} of {email}.",
  "settings.apps.summaryBeforeScan": "The {workspace} workspace, connected with a {field}.",
  "settings.apps.summaryAppSession":
    "The {workspace} workspace, connected with the {app} session of {email}.",
  "settings.apps.summaryAppSessionBeforeScan":
    "The {workspace} workspace, connected with your {app} session.",
  "settings.apps.summaryIntegrationUser":
    "The {workspace} workspace, connected with the integration user’s {app} session.",
  "settings.apps.noticeAccepted": "You accepted {app}’s notice on {day}.",
  "settings.apps.actsAsIntegrationUser": "Acts as the integration user",
  "settings.apps.usesOwnSession": "Uses your own session",
  "settings.connectWay.integrationUser": "Integration user",
  "settings.connectWay.recommended": "Recommended",
  "settings.connectWay.invite": "In {app}, invite {email} as an admin. Then press Connect.",
  "settings.connectWay.inviteToSwitch":
    "In the connected {app} workspace, invite {email} as an admin. Then press Switch.",
  "settings.connectWay.useOwnSession": "Use my own session",
  "settings.connectWay.ownSession": "My own session",
  "settings.connectWay.needsExtension": "Needs the Chrome extension.",
  "settings.connectWay.none": "You have none yet. Create it once, for all apps.",
  "settings.connectWay.create": "Create integration user",
  "settings.connectWay.notSetUp":
    "Its sign-in to Google isn’t set up yet. Finish it under Connections.",
  "settings.connectWay.openConnections": "Open Connections",
  "settings.connectWay.continue": "Continue",
  "settings.connectWay.switch": "Switch",
  "settings.connectWay.switchTitle": "Switch {app} to the integration user",
  "settings.connectWay.loadFailed": "Couldn’t load the integration user. Close this and try again.",
  "settings.integrationUserConnect.failedStep": "Failed",
  "settings.integrationUserConnect.membersNotRead":
    "{app} is connected, but its members couldn’t be read. Close this and look at {app} under Connections.",
  "settings.integrationUserConnect.scanRunning":
    "{app} is being scanned. Try again when the scan ends.",
  "settings.integrationUserConnect.title": "Connecting {app}",
  "settings.integrationUserConnect.switchTitle": "Switching {app} to the integration user",
  "settings.integrationUserConnect.canCloseSwitch":
    "You can close this. {app} shows “Acts as the integration user” when it is done.",
  "settings.integrationUserConnect.switched": "{app} now acts as the integration user.",
  "settings.integrationUserConnect.stepInvitation": "Accept the invitation",
  "settings.integrationUserConnect.stepSignIn": "Sign in to {app}",
  "settings.integrationUserConnect.stepMembers": "Read the members",
  "settings.integrationUserConnect.done": "Done",
  "settings.integrationUserConnect.working": "Working",
  "settings.integrationUserConnect.next": "Next",
  "settings.integrationUserConnect.canClose":
    "You can close this. {app} shows as connected when it is done.",
  "settings.integrationUserConnect.connected": "{app} is connected.",
  "settings.integrationUserConnect.close": "Close",
  "settings.integrationUserConnect.tryAgain": "Try again",
  "settings.integrationUserConnect.notInvited":
    "The integration user has no invitation in {app}. Invite it as an admin in {app}, then try again.",
  "settings.integrationUserConnect.notAdmin":
    "The integration user isn’t an admin in {app}. Make it an admin in {app}, then try again.",
  "settings.integrationUserConnect.blockedByCheck":
    "Google or {app} showed a check, which Broccoli Access never gets around. Try again later.",
  "settings.integrationUserConnect.authenticationFailed":
    "Google refused the integration user’s sign-in. Check the integration user under Connections, then try again.",
  "settings.integrationUserConnect.otherWorkspace":
    "The integration user signed in to another {app} workspace than the connected one, so the connection stays as it was. Make it an admin in the connected workspace, then try again.",
  "settings.integrationUserConnect.notSetUp":
    "The integration user’s sign-in to Google isn’t set up yet. Finish it under Connections, then try again.",
  "settings.integrationUserConnect.failed": "Couldn’t sign in to {app}. Try again.",
  "settings.appSession.stepExtension": "Extension",
  "settings.appSession.stepPair": "Pair",
  "settings.appSession.stepNotice": "Notice",
  "settings.appSession.stepSignIn": "Sign in",
  "settings.appSession.done": "Done",
  "settings.appSession.extensionTitle": "Add the Broccoli Access extension to Chrome",
  "settings.appSession.extensionBody":
    "{app} has no API for this on your plan, so Broccoli Access makes the calls {app}’s own admin pages make, with your own {app} session. The extension hands that session over when you connect.",
  "settings.appSession.sendsOnly":
    "It sends only {app}’s cookies and the token {app}’s signed-in page keeps, and only when you connect or reconnect.",
  "settings.appSession.waitingForExtension":
    "Waiting for the extension. This moves on by itself once it’s installed.",
  "settings.appSession.chromeOnly": "Works in Chrome only.",
  "settings.appSession.pairTitle": "Pair the extension with Broccoli Access",
  "settings.appSession.pairBody":
    "Pairing lets this Broccoli Access, at {host}, and no other site talk to the extension. Chrome shows the extension’s popup for you to confirm.",
  "settings.appSession.installed": "Installed in {browser}. Not paired yet.",
  "settings.appSession.noticeTitle": "Before you connect {app}",
  "settings.appSession.noticeChoice":
    "This is your choice for your company. Broccoli Access records who accepted it and when. You can disconnect {app} at any time.",
  "settings.appSession.noticeAccept": "I’ve read this and choose to connect {app}.",
  "settings.appSession.acceptAndContinue": "Accept and continue",
  "settings.appSession.signInTitle": "Sign in to {app} in Chrome, then Connect",
  "settings.appSession.signInBody":
    "Sign in to {app} in this Chrome as you always do, with SSO and two-step verification, as a {app} admin. Then come back here.",
  "settings.appSession.sendsNothingElse":
    "The extension sends Broccoli Access only {app}’s cookies and the token {app}’s signed-in page keeps, nothing from other sites.",
  "settings.appSession.storedEncrypted":
    "Your server stores them encrypted. It never sees your password or a two-step code.",
  "settings.appSession.openApp": "Open {app} in a new tab ↗",
  "settings.appSession.confirmInWindow": "Confirm in the extension’s window.",
  "settings.appSession.windowBlocked":
    "Chrome blocked the extension’s window. Allow pop-ups for this site, then try again.",
  "settings.appSession.notHandedOver":
    "Nothing was handed over. Connect {app} again when you’re ready.",
  "settings.appSession.readFailed":
    "Couldn’t check whether the extension handed over your session. Connect {app} again.",
  "settings.appSession.confirmTitle": "Connect the {workspace} workspace?",
  "settings.appSession.confirmBody": "Your {app} session in this Chrome opens this workspace.",
  "settings.appSession.confirmBodyIntegrationUser":
    "The integration user signed in to this {app} workspace. Nothing is connected until you confirm it.",
  "settings.appSession.notThisWorkspaceIntegrationUser":
    "Not this workspace? Cancel, take the integration user out of it in {app}, invite it to the right one, then Connect {app} again.",
  "settings.appSession.approvesNow": "Broccoli Access approves {app} and reads its members now.",
  "settings.appSession.readsDaily":
    "Each day it reads them again, which also keeps the session fresh.",
  "settings.appSession.notThisWorkspace":
    "Not this workspace? Switch to the right one in {app}, then Connect {app} again.",
  "settings.appSession.back": "Back",
  "settings.appSession.connectWorkspace": "Connect {workspace}",
  "settings.appSession.expired": "This hand-over expired. Connect {app} again.",
  "settings.appSession.otherWorkspace":
    "Your {app} session now opens another workspace. Go back, switch to the right one in {app}, then Connect {app} again.",
  "settings.appSession.pairAgainHint": "Did the extension say this Chrome isn’t paired?",
  "settings.appSession.refused":
    "{app} refused your session. Sign in to {app} again, then Connect {app} again.",
  "settings.apps.oneMember": "1 member.",
  "settings.apps.members": "{count} members.",
  "settings.apps.dialog.description":
    "Broccoli Access reads your {app} members and disables or enables them when you ask, through {app}’s API.",
  "settings.apps.dialog.readDescription": "Broccoli Access reads members through {app}’s API.",
  "settings.apps.dialog.secretHint": "{help} Broccoli Access stores it encrypted on your server.",
  "settings.apps.dialog.cancel": "Cancel",
  "settings.apps.dialog.connecting": "Connecting…",
  "settings.apps.dialog.required": "Enter the {field}.",
  "settings.apps.dialog.refused": "{app} refused it. Check it and try again.",
  "settings.apps.dialog.notAdmin": "{app} accepts only a key made by a {app} admin.",
  "settings.apps.dialog.unavailable": "Couldn’t check the connection to {app}. Try again.",
  "settings.apps.dialog.failed": "Couldn’t connect {app}. Try again.",
  "settings.apps.changeKey": "Change key",
  "settings.apps.dialog.newKeyTitle": "Paste a new key for {app}",
  "settings.apps.dialog.newKeyDescription":
    "Broccoli Access checks the new key with {app}, then uses it instead of the old one.",
  "settings.apps.dialog.checkAndSave": "Check and save",
  "settings.apps.dialog.checking": "Checking…",
  "settings.apps.dialog.otherWorkspace":
    "This key reaches another {app} workspace than the connected one.",
  "settings.googleApp.title": "Change Google app",
  "settings.googleApp.description":
    "Reconnect with the same Google app or choose another. For your own app, enter its client ID and secret again. Your people, apps and decisions stay as they are.",
  "settings.googleApp.cancelled": "You cancelled at Google. The Google app hasn’t changed.",
  "settings.googleApp.otherWorkspace":
    "That Google account belongs to another Google Workspace. Sign in with a super admin account of the connected workspace.",
  "settings.googleApp.failed": "Couldn’t change the Google app. Try again.",
  "settings.email.title": "Email",
  "settings.email.description": "Choose how Broccoli Access sends email and send yourself a test.",
  "settings.email.options": "How Broccoli Access sends email",
  "settings.email.smtp": "Your mail server (SMTP)",
  "settings.email.smtpHint": "Send through your own mail server or email provider.",
  "settings.email.resend": "Resend",
  "settings.email.resendHint": "Send with your Resend API key.",
  "settings.email.noEmail": "No email",
  "settings.email.noEmailHint":
    "Broccoli Access sends no email. You can still sign in with Google.",
  "settings.email.smtpUrl": "SMTP URL",
  "settings.email.smtpUrlHint": "Such as smtps://user:secret@smtp.acme-corp.example:465",
  "settings.email.resendKey": "API key",
  "settings.email.from": "From address",
  "settings.email.fromHint":
    "Emails come from this address. Your mail server or Resend must allow it.",
  "settings.email.secretSaved": "Saved",
  "settings.email.replace": "Replace",
  "settings.email.checkAndSave": "Check and save",
  "settings.email.save": "Save",
  "settings.email.checking": "Checking…",
  "settings.email.saving": "Saving…",
  "settings.email.saved": "Email settings saved",
  "settings.email.fromRequired": "Enter the address emails come from.",
  "settings.email.fromInvalid": "Enter an email address, such as people@acme-corp.example.",
  "settings.email.smtpUrlRequired": "Enter your SMTP URL.",
  "settings.email.smtpUrlInvalid": "Enter a URL that starts with smtp:// or smtps://.",
  "settings.email.smtpRejected":
    "Your mail server refused to sign in. Check the sign-in details in the URL.",
  "settings.email.resendKeyRequired": "Enter your Resend API key.",
  "settings.email.unavailable":
    "Your mail server could not be reached. Check the address and try again.",
  "settings.email.failed": "The settings could not be saved. Try again.",
  "settings.email.sendTest": "Send me a test email",
  "settings.email.sendingTest": "Sending…",
  "settings.email.testSent": "Test email sent to {email}",
  "settings.email.testRefused": "The test email was not sent: {reason}",
  "settings.email.testFailed": "The test email could not be sent. Try again.",
  "settings.email.loadFailed": "The email settings could not be loaded.",
  "settings.email.retry": "Try again",
} as const;
