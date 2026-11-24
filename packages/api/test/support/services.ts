import { createBeforeCommitBus, transactor, type Orm, type Transact } from "../../src/core/db";
import { createEventBus } from "../../src/core/events";
import type { ConnectorRegistry } from "../../src/core/connectors";
import type { JobQueue } from "../../src/core/jobs";
import { createMailSettingsService, type MailSettingsService } from "../../src/core/instance";
import { createLogger, type Logger } from "../../src/core/logger";
import {
  createEmployeeReadService,
  createEmployeeService,
  createDirectorySyncService,
  employeeDirectory,
  type EmployeeReadService,
  type EmployeeService,
} from "../../src/modules/employees";
import {
  createAppConnectionService,
  createAppAccountService,
  createAppInvitationService,
  createAppService,
  createAppUserService,
  type AppService,
  type AppUserService,
} from "../../src/modules/apps";
import {
  createExtensionPairingService,
  type ExtensionPairingService,
} from "../../src/modules/extension";
import {
  createImportRecordService,
  createScanService,
  type ScanService,
} from "../../src/modules/imports";
import {
  createGoogleConnectionService,
  createIntegrationUserService,
  createGoogleSignInService,
  createGoogleWorkspaceConnector,
  type GoogleConnectionService,
} from "../../src/modules/google";
import { createTemplateService, templatesModule } from "../../src/modules/templates";
import { createPersonPageReader, personPageLoader } from "../../src/modules";
import { accountChanges } from "./accountChanges";
import { fakeMail } from "./fakeMail";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { testTransactor } from "./testTransactor";
import { recordingJobQueue } from "./recordingJobQueue";

/** Every employee service a person's actions reach, together. */
export type EmployeeServices = EmployeeService & EmployeeReadService;

/** Every employee service on `orm`, with silent logs. */
export function employeeServices(
  orm: Orm,
  { transact = testTransactor(orm) }: { transact?: Transact } = {},
): EmployeeServices {
  const dependencies = { orm, transact, logger: createLogger("silent") };
  return {
    ...createEmployeeService(dependencies),
    ...createEmployeeReadService({ ...dependencies, accounts: apps(orm) }),
  };
}

export function extensionPairings(orm: Orm): ExtensionPairingService {
  return createExtensionPairingService({
    orm,
    secretBox: TEST_SECRET_BOX,
    logger: createLogger("silent"),
  });
}

export function mailSettings(
  orm: Orm,
  {
    publicUrl,
    mail = fakeMail(),
  }: {
    publicUrl?: string;
    mail?: Parameters<typeof createMailSettingsService>[0]["mail"];
  } = {},
): MailSettingsService {
  return createMailSettingsService({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    publicUrl,
    logger: createLogger("silent"),
    resendApiUrl: "http://127.0.0.1:9",
    mail,
  });
}

export function googleConnection(
  orm: Orm,
  {
    googleUrl,
    relayUrl,
    jobs = recordingJobQueue().jobs,
  }: { googleUrl: string; relayUrl?: string; jobs?: JobQueue },
): GoogleConnectionService {
  return createGoogleConnectionService({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    logger: createLogger("silent"),
    openIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
    adminApiUrl: googleUrl,
    relayUrl,
    connectedApps: createAppConnectionService({ secretBox: TEST_SECRET_BOX }),
    employeeDirectory: employeeDirectory(orm),
    scans: scans(orm, { googleUrl, relayUrl, jobs }),
  });
}

export function integrationUsers(
  orm: Orm,
  { googleUrl, logger = createLogger("silent") }: { googleUrl: string; logger?: Logger },
) {
  return createIntegrationUserService({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    logger,
    openIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
    adminApiUrl: googleUrl,
    connectedApps: createAppConnectionService({ secretBox: TEST_SECRET_BOX }),
  });
}

export function googleSignIn(
  orm: Orm,
  { googleUrl, relayUrl }: { googleUrl: string; relayUrl?: string },
) {
  return createGoogleSignInService({
    orm,
    secretBox: TEST_SECRET_BOX,
    openIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
    adminApiUrl: googleUrl,
    relayUrl,
    connectedApps: createAppConnectionService({ secretBox: TEST_SECRET_BOX }),
  });
}

/** App selection with real transactions and silent logs, with Google Workspace as the directory. */
export function apps(orm: Orm, transact: Transact = testTransactor(orm)): AppService {
  return createAppService({
    orm,
    transact,
    logger: createLogger("silent"),
    connectors: GOOGLE_DIRECTORY,
    members: createImportRecordService(),
  });
}

export function templates(
  orm: Orm,
  options: { connectors?: ConnectorRegistry; transact?: Transact } = {},
) {
  return createTemplateService(templateDependencies(orm, options));
}

export function templateReviewTransactor(orm: Orm) {
  const before = createBeforeCommitBus();
  const deps = templateDependencies(orm, {});
  before.subscribe(
    templatesModule(
      createTemplateService(deps),
      deps.employees.readEmployees,
      personPageLoader(personPages(orm)),
    ).eventsBeforeCommit!,
  );
  return transactor(orm, createEventBus(createLogger("silent")), before);
}

export function personPages(
  orm: Orm,
  options: { connectors?: ConnectorRegistry; afterAssignments?: () => Promise<void> } = {},
) {
  const service = templates(orm, options);
  return createPersonPageReader(orm, {
    ...service,
    ...appUsers(orm),
    ...accountChanges(orm, options),
    async readEmployeeTemplates(ctx, ids, db) {
      const assigned = await service.readEmployeeTemplates(ctx, ids, db);
      await options.afterAssignments?.();
      return assigned;
    },
  });
}

function templateDependencies(
  orm: Orm,
  options: { connectors?: ConnectorRegistry; transact?: Transact },
) {
  return {
    orm,
    transact: options.transact ?? testTransactor(orm),
    logger: createLogger("silent"),
    apps: { ...apps(orm), readAppInvites: accountChanges(orm, options).readAppInvites },
    employees: employeeServices(orm),
  };
}

/** An app's users read with the real employees module, with Google Workspace as the directory. */
export function appUsers(orm: Orm): AppUserService {
  return createAppUserService({
    orm,
    connectors: GOOGLE_DIRECTORY,
    members: createImportRecordService(),
    employees: createEmployeeReadService({ orm, accounts: apps(orm) }),
  });
}

/** Real scan dependencies with an instant retry wait and the local fake Google. */
export function scans(
  orm: Orm,
  {
    googleUrl = "http://127.0.0.1:9",
    relayUrl,
    jobs = recordingJobQueue().jobs,
    connectors,
    transact = testTransactor(orm),
  }: {
    googleUrl?: string;
    relayUrl?: string;
    jobs?: JobQueue;
    connectors?: ConnectorRegistry;
    transact?: Transact;
  },
): ScanService {
  return createScanService({
    orm,
    transact,
    logger: createLogger("silent"),
    jobs,
    connectors: connectors ?? {
      list: () =>
        Promise.resolve([
          createGoogleWorkspaceConnector({
            openIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
            adminApiUrl: googleUrl,
            relayUrl,
          }),
        ]),
    },
    apps: {
      ...createAppConnectionService({ secretBox: TEST_SECRET_BOX }),
      ...createAppAccountService(),
      ...createAppInvitationService(),
      ...apps(orm),
    },
    directory: createDirectorySyncService(),
    integrationUser: integrationUsers(orm, { googleUrl }),
    wait: () => Promise.resolve(),
  });
}

/** The Google Workspace connector as app reads see it, with no Google to call. */
const GOOGLE_DIRECTORY = [
  createGoogleWorkspaceConnector({
    openIdConfigurationUrl: "http://127.0.0.1:9/.well-known/openid-configuration",
    adminApiUrl: "http://127.0.0.1:9",
  }),
];
