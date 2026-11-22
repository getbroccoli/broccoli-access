import { expect, test } from "#test/support";

test("returns every editable field and deletion access to the owner", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee();

  const response = await browser.graphql(
    `
    query Employee($id: ID!) {
      employee(id: $id) { id access { canUpdate canDelete editableFields } }
    }
  `,
    { id: employee.id },
  );

  expect(await response.json()).toEqual({
    data: {
      employee: {
        id: employee.id,
        access: {
          canUpdate: true,
          canDelete: true,
          editableFields: ["firstName", "lastName", "email", "avatar"],
        },
      },
    },
  });
});

test("returns an employee's own writable fields", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();
  await env.seed.owner({ email: "another.owner@example.com" });
  const employee = await env.seed.employee({ userId: user.id });

  const response = await browser.graphql(
    `
    query Employee($id: ID!) {
      employee(id: $id) { id access { canUpdate canDelete editableFields } }
    }
  `,
    { id: employee.id },
  );

  expect(await response.json()).toEqual({
    data: {
      employee: {
        id: employee.id,
        access: {
          canUpdate: true,
          canDelete: false,
          editableFields: ["firstName", "lastName", "avatar"],
        },
      },
    },
  });
});

test("returns each listed employee's writable fields for the signed-in employee", async ({
  env,
}) => {
  const { browser, user } = await env.signInAsOwner();
  await env.seed.owner({ email: "another.owner@example.com" });
  const anna = await env.seed.employee({ firstName: "Anna", userId: user.id });
  const coworker = await env.seed.employee({ firstName: "Carl" });

  const response = await browser.graphql(`
    query Employees {
      employees { edges { node { id access { canUpdate editableFields } } } }
    }
  `);

  expect(await response.json()).toEqual({
    data: {
      employees: {
        edges: [
          {
            node: {
              id: anna.id,
              access: {
                canUpdate: true,
                editableFields: ["firstName", "lastName", "avatar"],
              },
            },
          },
          {
            node: {
              id: coworker.id,
              access: { canUpdate: false, editableFields: [] },
            },
          },
        ],
      },
    },
  });
});

test("refuses an employee updating a coworker's name through GraphQL", async ({ env }) => {
  const { browser, user } = await env.signInAsOwner();
  await env.seed.owner({ email: "another.owner@example.com" });
  await env.seed.employee({ userId: user.id });
  const coworker = await env.seed.employee();

  const response = await browser.graphql(
    `
    mutation UpdateEmployee($input: EmployeeUpdateInput!) {
      employees { update(input: $input) {
        employee { id }
        error { __typename ... on Error { message } }
      } }
    }
  `,
    { input: { id: coworker.id, firstName: "Lead" } },
  );

  expect(await response.json()).toMatchObject({
    errors: [
      {
        message: "You are not allowed to do this.",
        extensions: { code: "FORBIDDEN" },
      },
    ],
  });
});
