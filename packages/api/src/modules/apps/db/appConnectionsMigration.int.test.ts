import { fileURLToPath } from "node:url";

import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";
import { inject, onTestFinished } from "vitest";

import { createEmptyTestDatabase, expect, test } from "#test/support";

test("marks existing connections with an accepted notice as sessions from the extension", async () => {
  const database = await createEmptyTestDatabase(inject("testRun"));
  onTestFinished(() => database.drop());
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  onTestFinished(() => client.end());
  const migrations = readMigrationFiles({
    migrationsFolder: fileURLToPath(new URL("../../../../drizzle/", import.meta.url)),
  });
  // 0000 through 0015 are the released schema before connections say who made their session.
  for (const migration of migrations.slice(0, 16)) await client.query(migration.sql.join("\n"));
  await client.query(`
    insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values ('owner', 'Mia Novak', 'owner@example.com', true, now(), now());
    insert into apps (name, status) values ('Slack', 'approved'), ('Linear', 'approved');
    insert into app_connections
      (connector, app_id, settings, encrypted_secrets, notice_accepted_at, notice_accepted_by)
    select lower(name), id, '{}', 'v1:sealed',
      case name when 'Slack' then now() end, case name when 'Slack' then 'owner' end
    from apps;
  `);

  for (const migration of migrations.slice(16)) await client.query(migration.sql.join("\n"));

  const { rows } = await client.query({
    rowMode: "array",
    text: "select connector, session_from from app_connections order by connector",
  });
  expect(rows).toEqual([
    ["linear", null],
    ["slack", "extension"],
  ]);
});
