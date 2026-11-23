import { randomUUID } from "node:crypto";

import { user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";

export async function seedUser(
  orm: Orm,
  {
    id = randomUUID(),
    email,
    name = "User",
  }: {
    id?: string;
    email: string;
    name?: string;
  },
): Promise<{ id: string; email: string }> {
  const saved = { id, email: email.toLowerCase() };
  await orm.insert(user).values({ ...saved, name });
  return saved;
}
