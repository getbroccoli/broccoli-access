import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { account, user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";

export async function seedUser(
  orm: Orm,
  {
    email,
    password,
    name = "User",
  }: {
    email: string;
    password?: string;
    name?: string;
  },
): Promise<{ id: string; email: string }> {
  const saved = { id: randomUUID(), email: email.toLowerCase() };
  await orm.insert(user).values({ ...saved, name });
  if (password !== undefined) {
    await orm.insert(account).values({
      id: randomUUID(),
      accountId: saved.id,
      providerId: "credential",
      userId: saved.id,
      password: await hashPassword(password),
    });
  }
  return saved;
}
