import { createMailSettingsService } from "../core/instance";
import type { ModuleDependencies, Modules } from "../core/moduleManifest";
import { recordsManifest } from "../core/records";
import {
  appsModule,
  createAppAccountService,
  createAppConnectionService,
  createAppService,
  createAppUserService,
} from "./apps";
import {
  createDirectorySyncService,
  createEmployeeReadService,
  employeeDirectory,
  employeesModule,
} from "./employees";
import { extensionModule } from "./extension";
import { createGoogleWorkspaceConnector, googleModule } from "./google";
import { createScanService, importsModule } from "./imports";
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
  const googleAddresses = {
    openIdConfigurationUrl: settings.googleOpenIdConfigurationUrl,
    adminApiUrl: settings.googleAdminApiUrl,
  };
  const connectors = [createGoogleWorkspaceConnector(googleAddresses)];
  const connectedApps = createAppConnectionService(core);
  const apps = createAppService({ ...core, connectors });
  // One scan service for the job, the page and the consent, which share its progress.
  const scans = createScanService({
    ...core,
    connectors,
    apps: { ...connectedApps, ...createAppAccountService(), ...apps },
    directory: createDirectorySyncService(),
  });
  const manifests = [
    systemModule({
      ...core,
      mailSettings: createMailSettingsService({ ...core, publicUrl, resendApiUrl }),
    }),
    employeesModule({ ...core, accounts: apps }),
    googleModule({
      ...core,
      ...googleAddresses,
      connectedApps,
      scans,
      employeeDirectory: directory,
    }),
    importsModule(scans),
    appsModule({
      ...apps,
      ...createAppUserService({
        ...core,
        connectors,
        employees: createEmployeeReadService({ ...core, accounts: apps }),
      }),
    }),
    extensionModule(core),
  ];
  return {
    manifests: [...manifests, recordsManifest(core, manifests)],
    employeeDirectory: directory,
  };
}
