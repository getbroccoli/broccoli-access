import type { Orm, Transact } from "../../src/core/db";
import { createMailSettingsService, type MailSettingsService } from "../../src/core/instance";
import { createLogger } from "../../src/core/logger";
import {
  createEmployeeReadService,
  createEmployeeService,
  employeeDirectory,
  type EmployeeReadService,
  type EmployeeService,
} from "../../src/modules/employees";
import { createAppConnectionService } from "../../src/modules/apps";
import {
  createGoogleConnectionService,
  type GoogleConnectionService,
} from "../../src/modules/google";
import { fakeMail } from "./fakeMail";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { testTransactor } from "./testTransactor";

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
  { googleUrl }: { googleUrl: string },
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
  });
}
