import type { Orm, Transact } from "../../src/core/db";
import type { Connector } from "../../src/core/connectors";
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
} from "../../src/modules/apps";
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
    ...createEmployeeReadService(dependencies),
  };
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

/** Real scan dependencies with an instant retry wait and the local fake Google. */
export function scans(
  orm: Orm,
  {
    googleUrl,
    jobs = recordingJobQueue().jobs,
    connectors,
  }: {
    googleUrl: string;
    jobs?: JobQueue;
    connectors?: readonly Connector[];
  },
): ScanService {
  return createScanService({
    orm,
    transact: testTransactor(orm),
    logger: createLogger("silent"),
    jobs,
    connectors: connectors ?? [
      createGoogleWorkspaceConnector({
        openIdConfigurationUrl: `${googleUrl}/.well-known/openid-configuration`,
        adminApiUrl: googleUrl,
      }),
    ],
    apps: {
      ...createAppConnectionService({ secretBox: TEST_SECRET_BOX }),
      ...createAppAccountService(),
      ...createAppService(),
    },
    directory: createDirectorySyncService(),
    wait: () => Promise.resolve(),
  });
}
