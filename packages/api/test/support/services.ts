import assert from "node:assert/strict";

import type { Orm, Transact } from "../../src/core/db";
import {
  createMailSettingsService,
  createPasswordResetEmailService,
  type MailSettingsService,
} from "../../src/core/instance";
import type { Jobs } from "../../src/core/jobs";
import { createLogger } from "../../src/core/logger";
import {
  createEmployeeReadService,
  createEmployeeService,
  type EmployeeReadService,
  type EmployeeService,
} from "../../src/modules/employees";
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

export function passwordResetEmail(
  orm: Orm,
  options: NonNullable<Parameters<typeof mailSettings>[1]>,
) {
  const sentJobs: {
    name: "instance.sendPasswordResetEmail";
    payload: Jobs["instance.sendPasswordResetEmail"];
  }[] = [];
  const service = createPasswordResetEmailService({
    orm,
    transact: testTransactor(orm),
    secretBox: TEST_SECRET_BOX,
    mailSettings: mailSettings(orm, options),
    logger: createLogger("silent"),
    jobs: {
      send: (_tx, name, payload) => {
        assert.equal(name, "instance.sendPasswordResetEmail");
        assert("userId" in payload && "encryptedToken" in payload);
        sentJobs.push({ name: "instance.sendPasswordResetEmail", payload });
        return Promise.resolve();
      },
    },
  });
  return { ...service, sentJobs };
}
