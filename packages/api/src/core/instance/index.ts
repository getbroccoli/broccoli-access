// Public values.
export {
  createInstanceService,
  createMailSettingsService,
  createOwnerService,
  createPasswordResetEmailService,
  createSetupSessionService,
} from "./app";
export { refuseBearerAuth, resolveSecurityContext } from "./betterAuth";
export { selfHostedServer } from "./selfHostedServer";
export { MAIL_SOURCES } from "./domain";

// Public types.
export type {
  InstanceMailer,
  MailIntegration,
  MailSettingsService,
  PasswordResetEmailService,
} from "./app";
export type { MailChoice, MailConfig, MailSource } from "./domain";
