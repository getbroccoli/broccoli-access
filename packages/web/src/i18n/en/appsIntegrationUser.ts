/** English copy for acting through an app connection and its integration user. */
export const appsIntegrationUserEn = {
  "apps.change.howItWorks":
    "Broccoli Access makes the change {actor}, then reads the account back from {app}.",
  "apps.change.howInviteWorks":
    "Broccoli Access asks {app} to send the invitation {actor}, then reads it back from {app}.",
  "apps.change.howInviteAsIntegrationUserWorks":
    "Broccoli Access acts {actor} to ask {app} to send the invitation, then reads it back from {app}.",
  "apps.change.actor.credential": "with your {field}",
  "apps.change.actor.integrationUser": "as the integration user",
  "apps.change.actor.ownerSession": "with your {app} admin session",
  "apps.change.actorLine": "Broccoli Access acts {actor}.",
  "apps.couldnt.integrationUserSuspended":
    "{app} stopped: the integration user is suspended in Google.",
  "apps.couldnt.integrationUserRefused": "{app} did not accept the integration user’s sign-in.",
  "apps.couldnt.integrationUserNotAdmin":
    "The integration user is no longer an admin in {app}. If it is not a member, invite it as an admin.",
  "apps.couldnt.integrationUserCheck":
    "A check, such as a CAPTCHA, stopped Broccoli Access from signing in to {app} as the integration user. Only a person can pass it.",
  "apps.couldnt.integrationUserElsewhere":
    "The integration user’s sign-in reaches another workspace, not {workspace}.",
  "apps.couldnt.reconnectIntegrationUser":
    "Sign the integration user in to {app} again, then try again.",
  "apps.reconnect.failsUntilIntegrationUser":
    "Changes in {app} fail until the integration user signs in again.",
  "apps.reconnect.integrationUserButton": "Sign in again as the integration user",
  "apps.reconnect.integrationUserSuspendedHint":
    "Restore the integration user in Google, then sign in again.",
} as const;
