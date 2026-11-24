import { fileURLToPath } from "node:url";

import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";
import { inject, onTestFinished } from "vitest";

import { createEmptyTestDatabase, expect, test } from "#test/support";

test("upgrades existing accounts to personal and backfills only existing email links", async () => {
  const database = await createEmptyTestDatabase(inject("testRun"));
  onTestFinished(() => database.drop());
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  onTestFinished(() => client.end());
  const migrations = readMigrationFiles({
    migrationsFolder: fileURLToPath(new URL("../../../../drizzle/", import.meta.url)),
  });
  // 0000 through 0011 are the released schema before account linking.
  for (const migration of migrations.slice(0, 12)) await client.query(migration.sql.join("\n"));
  await client.query(`
    insert into apps (name, status) values ('Slack', 'approved');
    insert into employees (first_name, last_name, email) values ('Ana', 'Ruiz', 'ana@example.com');
    insert into app_accounts (app_id, employee_id, email, status, first_seen_at, found_via)
    select apps.id, employees.id, accounts.email, 'active', now(), array['slack_members']
    from apps cross join (values ('ana@example.com'), ('private@example.com')) as accounts(email)
    left join employees on employees.email = accounts.email;
  `);

  for (const migration of migrations.slice(12)) await client.query(migration.sql.join("\n"));

  await client.query(`insert into app_accounts (app_id, email, status, first_seen_at, found_via)
    select id, 'new@example.com', 'active', now(), array['slack_members'] from apps`);
  const { rows } = await client.query({
    rowMode: "array",
    text: `select a.email, a.kind, a.note, a.employee_linked_by, e.email
      from app_accounts a left join employees e on e.id = a.employee_id order by a.email`,
  });
  expect(rows).toEqual([
    ["ana@example.com", "personal", null, "email", "ana@example.com"],
    ["new@example.com", "personal", null, null, null],
    ["private@example.com", "personal", null, null, null],
  ]);
});
