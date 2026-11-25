import type { OffboardingByHandReason } from "@/__generated__/graphql";
import type { MessageKey } from "@/i18n";

/** Why an app is the owner's work by hand, as Offboard and the person's page say it. */
export const BY_HAND_REASONS: Record<OffboardingByHandReason, MessageKey> = {
  APP_HAS_NO_CONNECTION: "apps.change.noConnection",
  INVITATION_IS_PENDING: "people.offboard.openInvitation",
  CONNECTION_NEEDS_RECONNECT: "people.offboard.reconnectNeeded",
  ACCOUNT_IS_CONNECTION_USER: "people.offboard.connectionUser",
  CHANGE_IS_RUNNING: "people.offboard.changeRunning",
};
