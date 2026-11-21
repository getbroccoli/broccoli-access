import { createMailSettingsService, createPasswordResetEmailService } from "../core/instance";
import type { ModuleDependencies, Modules } from "../core/moduleManifest";
import { recordsManifest } from "../core/records";
import { employeeDirectory, employeesModule } from "./employees";
import { systemModule } from "./system";

/** Settings that only some modules need, read from the environment by `main.ts`. */
export interface ModuleSettings {
  /** `SELF_HOSTED_PUBLIC_URL`; unset takes the address from each request. */
  publicUrl?: string;
  /** Resend's API, for an owner who chose to send email with their Resend key. */
  resendApiUrl: string;
}

/** Every module of the API, each given only the dependencies it uses. */
export function createModules(
  core: ModuleDependencies,
  { publicUrl, resendApiUrl }: ModuleSettings,
): Modules {
  const mailSettings = createMailSettingsService({ ...core, publicUrl, resendApiUrl });
  const passwordResetEmail = createPasswordResetEmailService({ ...core, mailSettings });
  const manifests = [
    systemModule({ ...core, mailSettings, passwordResetEmail }),
    employeesModule(core),
  ];
  return {
    manifests: [...manifests, recordsManifest(core, manifests)],
    employeeDirectory: employeeDirectory(core.orm),
    passwordResetEmail,
  };
}
