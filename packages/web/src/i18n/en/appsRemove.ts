/** English copy for removing an account, including failures and reconnect. */
export const appsRemoveEn = {
  "apps.activity.reason.removeRefused": "The removal was refused",
  "apps.change.remove": "Remove",
  "apps.change.removeName": "Remove {name} from {app}",
  "apps.change.removeTitle": "Remove {name} from {app}?",
  "apps.change.removeWarning": "This cannot be undone.",
  "apps.change.confirmRemove": "Remove from {app}",
  "apps.change.removing": "Removing from {app}…",
  "apps.change.removedToast": "Removed {name} from {app}.",
  "apps.couldnt.remove": "Couldn’t remove",
  "apps.couldnt.removeTitle": "Couldn’t remove {name} from {app}",
  "apps.couldnt.tryAgainRemove": "Try again to remove {name} from {app}",
  "apps.couldnt.hintRemove":
    "Try again in a while, or remove {firstName} from {app} yourself and tell Broccoli Access.",
  "apps.couldnt.hintRemoveByHand":
    "Remove {firstName} from {app} yourself and tell Broccoli Access.",
  "apps.couldnt.hintRemoveAfterReconnect":
    "Reconnect to try again, or remove {firstName} from {app} yourself and tell Broccoli Access.",
  "apps.byHand.removeTitle": "Did you remove {name} from {app} yourself?",
  "apps.byHand.removeEffect":
    "Broccoli Access updates the list now. If another source still finds this account, it stays listed as “Not in {app}”. The next scan checks the removal.",
  "apps.reconnect.foundByRemove": "Found when you tried to remove {name} {when}.",
  "apps.change.retryRefused":
    "This removal could not be retried. Reload the page, then choose Remove again if it is still offered.",
  "apps.couldnt.unconfirmedRemoval":
    "Broccoli Access couldn’t confirm the removal. Check the member list in {app}.",
  "apps.couldnt.removeNotAllowed": "The removal was refused.",
  "apps.couldnt.hintRemoveRefused":
    "Trying again won’t help. Scan {app} to see whether {firstName} is still disabled, or remove {firstName} from {app} yourself and tell Broccoli Access.",
  "apps.couldnt.hintActiveRemoveRefused": "Scan {app} or remove {firstName} by hand.",
} as const;
