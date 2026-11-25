import { createMailSettingsService } from "../core/instance";
import type { ModuleDependencies, Modules } from "../core/moduleManifest";
import { recordsManifest } from "../core/records";
import {
  appsModule,
  createAccountLinkService,
  createAccountChangeService,
  createAppAccountService,
  createAppInvitationService,
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
import {
  createGoogleWorkspaceConnector,
  createIntegrationUserService,
  googleModule,
} from "./google";
import { createImportRecordService, createScanService, importsModule } from "./imports";
import { systemModule } from "./system";
import { createPersonPageReader, personPageLoader } from "./personPageReader";
import { readInviteRole, createTemplateService, templatesModule } from "./templates";

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
  googleRelayUrl?: string;
}

/** Every module of the API, each given only the dependencies it uses. */
// eslint-disable-next-line broccoli-access/max-lines-per-function -- the composition root: one entry per module it wires, in order.
export function createModules(core: ModuleDependencies, settings: ModuleSettings): Modules {
  const { publicUrl, resendApiUrl } = settings;
  const directory = employeeDirectory(core.orm);
  const googleAddresses = {
    openIdConfigurationUrl: settings.googleOpenIdConfigurationUrl,
    adminApiUrl: settings.googleAdminApiUrl,
    relayUrl: settings.googleRelayUrl,
  };
  const { directoryConnectors, containerConnectors, connectors } = createConnectors(
    core,
    googleAddresses,
    settings.connectorsUrl,
  );
  const connectedApps = createAppConnectionService(core);
  const importRecords = createImportRecordService();
  // One service for Settings and the scans, which skip the integration user.
  const integrationUsers = createIntegrationUserService({
    ...core,
    ...googleAddresses,
    connectedApps,
    connectorsUrl: settings.connectorsUrl,
    records: importRecords,
    // The scans read the integration user, so its creation reaches them once both exist.
    scans: { scanConnection: (...scan) => scans.scanConnection(...scan) },
  });
  const apps = createAppService({
    ...core,
    connectors: directoryConnectors,
    members: importRecords,
  });
  // One scan service for the job, the page and the connect flows, which share its progress.
  const scans = createScanService({
    ...core,
    connectors,
    apps: {
      ...connectedApps,
      ...createAppAccountService(),
      ...createAppInvitationService(),
      ...apps,
    },
    directory: createDirectorySyncService(),
    integrationUser: integrationUsers,
  });
  // One service for Settings and the extension, which share the app sessions handed over.
  const containerConnections = createContainerConnectionService({
    ...core,
    containerConnectors,
    connectedApps,
    scans,
  });
  const employees = createEmployeeReadService({ ...core, accounts: apps });
  const changes = createAccountChangeService({
    readInviteRole,
    ...core,
    connectors,
    members: importRecords,
    employees,
    integrationUser: integrationUsers,
  });
  const users = createAppUserService({
    ...core,
    connectors: directoryConnectors,
    members: importRecords,
    employees,
  });
  const templates = createTemplateService({
    ...core,
    apps: { ...apps, readAppRoles: changes.readAppRoles, readAppInvites: changes.readAppInvites },
    employees,
  });
  const people = personPageLoader(
    createPersonPageReader(core.orm, { ...users, ...changes, ...templates }),
  );
  const manifests = [
    systemModule({
      ...core,
      mailSettings: createMailSettingsService({ ...core, publicUrl, resendApiUrl }),
    }),
    employeesModule({ ...core, accounts: apps }),
    googleModule({
      ...core,
      publicUrl,
      ...googleAddresses,
      connectedApps,
      scans,
      employeeDirectory: directory,
      integrationUsers,
    }),
    importsModule(scans),
    connectorsModule(containerConnections),
    appsModule(
      {
        ...apps,
        ...users,
        ...changes,
        ...createAccountLinkService({
          ...core,
          connectors: directoryConnectors,
          members: importRecords,
          employees,
        }),
      },
      people,
    ),
    extensionModule({ ...core, appSessions: containerConnections }),
    templatesModule(templates, employees.readEmployees, people),
  ];
  return {
    manifests: [...manifests, recordsManifest(core, manifests)],
    employeeDirectory: directory,
  };
}

/** Google Workspace, the directory, then the connectors container's, read at start. */
function createConnectors(
  { logger }: ModuleDependencies,
  googleAddresses: { openIdConfigurationUrl: string; adminApiUrl: string; relayUrl?: string },
  connectorsUrl: string | undefined,
) {
  const directoryConnectors = [createGoogleWorkspaceConnector(googleAddresses)];
  const containerConnectors = createContainerConnectors({ url: connectorsUrl, logger });
  // Read at start, so the log shows at once whether the container answers.
  void containerConnectors.list();
  const connectors = {
    list: async () => [...directoryConnectors, ...(await containerConnectors.list())],
  };
  return { directoryConnectors, containerConnectors, connectors };
}

export { createPersonPageReader, personPageLoader } from "./personPageReader";
