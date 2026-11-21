import type { Orm } from "../../src/core/db";
import { instanceRepository } from "../../src/core/instance/db";
import { employeeServices, mailSettings } from "./services";
import { recordHistory } from "./statelessServices";
import { OWNER } from "./testSecurityContext";
import { TEST_SECRET_BOX } from "./testSecretBox";
import type { TestSeed } from "./testSeed";

export interface StoredTextProbe {
  act: () => Promise<unknown>;
  read: () => Promise<string | null>;
  expected: string | null;
}

/** Each probe uses an ordinary public write and reads the persisted value back separately. */
export async function storedTextProbe(
  orm: Orm,
  seed: TestSeed,
  entry: string,
  value: string,
): Promise<StoredTextProbe> {
  const expected = value.trim();
  if (entry.startsWith("employee.create.") || entry.startsWith("employee.update.")) {
    const field = entry.split(".")[2]!;
    const service = employeeServices(orm);
    const existing = await seed.employee();
    let id = existing.id;
    return {
      expected: field === "email" ? expected.toLowerCase() : expected,
      act: async () => {
        if (entry.startsWith("employee.create.")) {
          const employee = await service.createEmployee(OWNER, {
            firstName: "Avery",
            lastName: "Stone",
            email: `new-${existing.id}@example.com`,
            [field]: value,
          });
          id = employee!.id;
        } else await service.updateEmployee(OWNER, { id, [field]: value });
      },
      read: async () => {
        const employee = (await service.readEmployee(OWNER, id))!;
        return {
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
        }[field]!;
      },
    };
  }
  if (entry.startsWith("employee.reason.")) {
    const service = employeeServices(orm);
    const unique = await seed.employee();
    const user = await seed.user({ email: `user-${unique.id}@example.com` });
    const employee = await seed.employee({ userId: user.id });
    return {
      expected: expected || null,
      act: async () => {
        if (entry.endsWith("update"))
          await service.updateEmployee(OWNER, {
            id: employee.id,
            firstName: "Changed",
            changeReason: value,
          });
        else await service.deleteEmployee(OWNER, { id: employee.id, changeReason: value });
      },
      read: async () =>
        (await recordHistory.read(orm, "employee", employee.id, { first: 1 })).edges[0]!.node
          .reason,
    };
  }
  const service = mailSettings(orm);
  await service.save(OWNER, { source: "no_email" }, "https://example.com");
  return {
    expected,
    act: () =>
      service.save(
        OWNER,
        {
          source: "resend_api",
          from: entry === "mail.from" ? value : "access@example.com",
          secret: entry === "mail.secret" ? value : "test-key",
        },
        "https://example.com",
      ),
    read: async () => {
      if (entry === "mail.from") return (await service.read(OWNER)).from;
      const saved = await instanceRepository(orm).readMailSender();
      return TEST_SECRET_BOX.decrypt(saved.encryptedSecret!);
    },
  };
}
