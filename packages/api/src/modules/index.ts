import { createMailSettingsService } from "../core/instance";
import type { ModuleDependencies, Modules } from "../core/moduleManifest";
import { recordsManifest } from "../core/records";
import {
  appsModule,
  createAccountChangeService,
  createAppAccountService,
  createAppConnectionService,
  createAppService,
  createAppUserService,
} from "./apps";
import {
  connectorsModule,
  createContainerConnectionService,
  createContainerConnectors,
} from "./connectors";
import {
  createDirectorySyncService,
  createEmployeeReadService,
  employeeDirectory,
  employeesModule,
} from "./employees";
import { extensionModule } from "./extension";
import { createGoogleWorkspaceConnector, googleModule } from "./google";
import { createImportRecordService, createScanService, importsModule } from "./imports";
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
  /** `CONNECTORS_URL`: the connectors container; unset means no app connects through it. */
  connectorsUrl?: string;
}

/** Every module of the API, each given only the dependencies it uses. */
// eslint-disable-next-line broccoli-access/max-lines-per-function -- the composition root: one entry per module it wires, in order.
export function createModules(core: ModuleDependencies, settings: ModuleSettings): Modules {
  const { publicUrl, resendApiUrl } = settings;
  const directory = employeeDirectory(core.orm);
  const googleAddresses = {
    openIdConfigurationUrl: settings.googleOpenIdConfigurationUrl,
    adminApiUrl: settings.googleAdminApiUrl,
  };
  const { containerConnectors, connectors } = createConnectors(
    core,
    googleAddresses,
    settings.connectorsUrl,
  );
  const connectedApps = createAppConnectionService(core);
  const apps = createAppService({ ...core, connectors });
  // One scan service for the job, the page and the connect flows, which share its progress.
  const scans = createScanService({
    ...core,
    connectors,
    apps: { ...connectedApps, ...createAppAccountService(), ...apps },
    directory: createDirectorySyncService(),
  });
  // One service for Settings and the extension, which share the app sessions handed over.
  const containerConnections = createContainerConnectionService({
    ...core,
    containerConnectors,
    connectedApps,
    scans,
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
    connectorsModule(containerConnections),
    appsModule({
      ...apps,
      ...createAppUserService({
        ...core,
        connectors,
        employees: createEmployeeReadService({ ...core, accounts: apps }),
      }),
      ...createAccountChangeService({ ...core, connectors, members: createImportRecordService() }),
    }),
    extensionModule({ ...core, appSessions: containerConnections }),
  ];
  return {
    manifests: [...manifests, recordsManifest(core, manifests)],
    employeeDirectory: directory,
  };
}

/** Google Workspace, the directory, then the connectors container's, read at start. */
function createConnectors(
  { logger }: ModuleDependencies,
  googleAddresses: { openIdConfigurationUrl: string; adminApiUrl: string },
  connectorsUrl: string | undefined,
) {
  const directoryConnectors = [createGoogleWorkspaceConnector(googleAddresses)];
  const containerConnectors = createContainerConnectors({ url: connectorsUrl, logger });
  // Read at start, so the log shows at once whether the container answers.
  void containerConnectors.list();
  const connectors = {
    list: async () => [...directoryConnectors, ...(await containerConnectors.list())],
  };
  return { containerConnectors, connectors };
}
