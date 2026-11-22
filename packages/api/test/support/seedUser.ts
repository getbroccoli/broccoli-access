import { randomUUID } from "node:crypto";

import { user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";

export async function seedUser(
  orm: Orm,
  {
    email,
    name = "User",
  }: {
    email: string;
    name?: string;
  },
): Promise<{ id: string; email: string }> {
  const saved = { id: randomUUID(), email: email.toLowerCase() };
  await orm.insert(user).values({ ...saved, name });
  return saved;
}
