import { readSdl } from "../../core/graphql";
import type { MailSettingsService, PasswordResetEmailService } from "../../core/instance";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createResolvers } from "./graphql";

/** What the system module works with. */
export interface SystemDependencies extends Pick<ModuleDependencies, "orm"> {
  mailSettings: MailSettingsService;
  /** Its job sends the email of a password reset. */
  passwordResetEmail: Pick<PasswordResetEmailService, "jobs">;
}

/** Platform-level API fields that belong to no business module: setup, the user and mail. */
export function systemModule(dependencies: SystemDependencies): ModuleManifest {
  return {
    name: "system",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(dependencies),
    jobs: dependencies.passwordResetEmail.jobs,
  };
}
