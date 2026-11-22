import type { Orm } from "../../src/core/db";
import { files } from "../../src/core/files";
import { instanceRepository } from "../../src/core/instance/db";
import type { MailSource, SetupStep } from "../../src/core/instance/domain";
import { hashSetupToken } from "../../src/core/instance/helpers";
import { PrincipalSecurityContext, type SecurityContext } from "../../src/core/security";
import { employeeDirectory, type Employee } from "../../src/modules/employees";
import { employeeRepository } from "../../src/modules/employees/db";
import {
  appAccountRepository,
  appRepository,
  type App,
  type AppAccountRepository,
} from "../../src/modules/apps/db";
import { TEST_SECRET_BOX } from "./testSecretBox";
import { seedUser } from "./seedUser";
import { testTransactor } from "./testTransactor";

type SeedEmployee = Partial<Omit<Employee, "id" | "createdAt">>;
type SeedAppAccount = Parameters<AppAccountRepository["insertMany"]>[0][number];

/**
 * Creates test data by inserting through each module's repository, skipping use
 * cases, so setup does not depend on the code under test. Defaults are unique,
 * normalised example values; a test sets only the fields it is about.
 */
export class TestSeed {
  #count = 0;

  constructor(private readonly orm: Orm) {}

  async owner({
    email = "owner@example.com",
    name,
  }: { email?: string; name?: string } = {}): Promise<SecurityContext> {
    const saved = await this.user({ email, name });
    const instance = instanceRepository(this.orm);
    await instance.setOwner(saved.id, (await instance.readInstance()).step);
    return PrincipalSecurityContext.user(
      {
        userId: saved.id,
        email: saved.email,
        isOwner: true,
        permissionProfiles: ["EMPLOYEE", "OWNER"],
        employeeId: null,
      },
      employeeDirectory(this.orm),
    );
  }

  user(options: Parameters<typeof seedUser>[1]): Promise<{ id: string; email: string }> {
    return seedUser(this.orm, options);
  }

  /** Moves setup straight to `step`, whatever step it is at. */
  async setupStep(step: SetupStep): Promise<void> {
    const instance = instanceRepository(this.orm);
    await instance.advanceStep((await instance.readInstance()).step, step);
  }

  async setupSession({
    token = "setup-token",
    expiresAt,
  }: {
    token?: string;
    expiresAt: Date;
  }): Promise<void> {
    await instanceRepository(this.orm).saveSetupSession({
      tokenHash: hashSetupToken(token),
      expiresAt,
    });
  }

  async mailSettings({
    source = "resend_api",
    from = "access@example.com",
    secret = "resend-key",
    linkOrigin = "https://access.example.com",
  }: {
    source?: MailSource;
    from?: string | null;
    secret?: string | null;
    linkOrigin?: string | null;
  } = {}): Promise<void> {
    await instanceRepository(this.orm).storeMailSettings({
      source,
      from,
      linkOrigin,
      encryptedSecret:
        source === "no_email" || secret === null ? null : TEST_SECRET_BOX.encrypt(secret),
    });
  }

  async file({ content, mimeType }: { content: Buffer; mimeType: string }): Promise<string> {
    const [file] = await this.orm
      .insert(files)
      .values({ content, mimeType })
      .returning({ id: files.id });
    return file!.id;
  }

  employee(overrides: SeedEmployee = {}): Promise<Employee> {
    return testTransactor(this.orm)((tx) =>
      employeeRepository(tx).insert({ ...this.#newEmployee(), ...overrides }),
    );
  }

  async app({ status = "discovered" }: { status?: App["status"] } = {}): Promise<App> {
    const [app] = await appRepository(this.orm).insertMany(
      [{ name: "Slack", domain: "slack.com", catalogKey: "slack", externalIds: [] }],
      status,
    );
    return app!;
  }

  async appAccount({
    appId,
    email = `account${++this.#count}@example.com`,
    employeeId = null,
    status = "active",
    foundVia = ["google_sign_in"],
    grantedAt = null,
    grantedBefore = null,
    firstSeenAt = new Date("2026-01-01T00:00:00Z"),
  }: Pick<SeedAppAccount, "appId"> & Partial<SeedAppAccount>) {
    const [account] = await appAccountRepository(this.orm).insertMany([
      { appId, email, employeeId, status, foundVia, grantedAt, grantedBefore, firstSeenAt },
    ]);
    return account!;
  }

  #newEmployee() {
    const number = ++this.#count;
    return {
      firstName: "Employee",
      lastName: String(number),
      email: `employee${number}@example.com`,
    };
  }
}
