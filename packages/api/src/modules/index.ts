import { createMailSettingsService } from "../core/instance";
import type { ModuleDependencies, Modules } from "../core/moduleManifest";
import { recordsManifest } from "../core/records";
import { createAppConnectionService } from "./apps";
import { employeeDirectory, employeesModule } from "./employees";
import { googleModule } from "./google";
import { systemModule } from "./system";

/** Settings that only some modules need, read from the environment by `main.ts`. */
export interface ModuleSettings {
  /** `SELF_HOSTED_PUBLIC_URL`; unset takes the address from each request. */
  publicUrl?: string;
  /** Resend's API, for an owner who chose to send email with their Resend key. */
  resendApiUrl: string;
  /** `GOOGLE_OPENID_CONFIGURATION_URL`: where Google's consent finds its endpoints. */
  googleOpenIdConfigurationUrl: string;
  /** `GOOGLE_ADMIN_API_URL`: where Google's Directory answers. */
  googleAdminApiUrl: string;
}

/** Every module of the API, each given only the dependencies it uses. */
export function createModules(core: ModuleDependencies, settings: ModuleSettings): Modules {
  const { publicUrl, resendApiUrl } = settings;
  const directory = employeeDirectory(core.orm);
  const manifests = [
    systemModule({
      ...core,
      mailSettings: createMailSettingsService({ ...core, publicUrl, resendApiUrl }),
    }),
    employeesModule(core),
    googleModule({
      ...core,
      openIdConfigurationUrl: settings.googleOpenIdConfigurationUrl,
      adminApiUrl: settings.googleAdminApiUrl,
      connectedApps: createAppConnectionService(core),
      employeeDirectory: directory,
    }),
  ];
  return {
    manifests: [...manifests, recordsManifest(core, manifests)],
    employeeDirectory: directory,
  };
}
