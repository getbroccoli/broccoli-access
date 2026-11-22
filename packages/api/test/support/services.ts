import type { Orm, Transact } from "../../src/core/db";
import type { ConnectorRegistry } from "../../src/core/connectors";
import type { JobQueue } from "../../src/core/jobs";
import { createMailSettingsService, type MailSettingsService } from "../../src/core/instance";
import { createLogger } from "../../src/core/logger";
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
  createAppService,
  createAppUserService,
  type AppService,
  type AppUserService,
} from "../../src/modules/apps";
import {
  createExtensionPairingService,
  type ExtensionPairingService,
} from "../../src/modules/extension";
import { createScanService, type ScanService } from "../../src/modules/imports";
import {
  createGoogleConnectionService,
  createGoogleSignInService,
  createGoogleWorkspaceConnector,
  type GoogleConnectionService,
} from "../../src/modules/google";
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
  { googleUrl, jobs = recordingJobQueue().jobs }: { googleUrl: string; jobs?: JobQueue },
): GoogleConnectionService {
  return createGoogleConnectionService({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    logger: createLogger("silent"),
    openIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
    adminApiUrl: googleUrl,
    connectedApps: createAppConnectionService({ secretBox: TEST_SECRET_BOX }),
    employeeDirectory: employeeDirectory(orm),
    scans: scans(orm, { googleUrl, jobs }),
  });
}

export function googleSignIn(orm: Orm, { googleUrl }: { googleUrl: string }) {
  return createGoogleSignInService({
    orm,
    secretBox: TEST_SECRET_BOX,
    openIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
    adminApiUrl: googleUrl,
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
  });
}

/** An app's users read with the real employees module, with Google Workspace as the directory. */
export function appUsers(orm: Orm): AppUserService {
  return createAppUserService({
    orm,
    connectors: GOOGLE_DIRECTORY,
    employees: createEmployeeReadService({ orm, accounts: apps(orm) }),
  });
}

/** Real scan dependencies with an instant retry wait and the local fake Google. */
export function scans(
  orm: Orm,
  {
    googleUrl = "http://127.0.0.1:9",
    jobs = recordingJobQueue().jobs,
    connectors,
    transact = testTransactor(orm),
  }: {
    googleUrl?: string;
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
          }),
        ]),
    },
    apps: {
      ...createAppConnectionService({ secretBox: TEST_SECRET_BOX }),
      ...createAppAccountService(),
      ...apps(orm),
    },
    directory: createDirectorySyncService(),
    wait: () => Promise.resolve(),
  });
}

/** The Google Workspace connector as app reads see it: only its key and directory flag. */
const GOOGLE_DIRECTORY = [{ key: "google_workspace", isDirectory: true }];
