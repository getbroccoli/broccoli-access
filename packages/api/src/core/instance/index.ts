// Public values.
export {
  createInstanceService,
  createMailSettingsService,
  createOwnerService,
  createSetupSessionService,
  createSetupStepService,
} from "./app";
export { readSetupToken, refuseBearerAuth, resolveSecurityContext } from "./betterAuth";
export { selfHostedServer } from "./selfHostedServer";
export { MAIL_SOURCES } from "./domain";

// Public types.
export type { InstanceMailer, MailIntegration, MailSettingsService, SetupStepService } from "./app";
export type { MailChoice, MailConfig, MailSource } from "./domain";
