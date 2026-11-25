import {
  ACCOUNT_CHANGE_POLL,
  allowGoogleUserWrites,
  connectedLinear,
  connectorTest as test,
  createdGoogleUsers,
  expect,
  finishSetupWithDemoApps,
  linearInvitations,
  NEW_PERSON,
} from "#test/support";

test("the owner adds a person with two templates, provisions Google and Linear, and gets the first password", async ({
  env,
  fakeGoogle,
  fakeConnectors,
}) => {
  const { browser, appId } = await connectedLinear(env);
  const engineering = await env.seed.template({ name: "Engineering", appIds: [appId] });
  const staff = await env.seed.template({ name: "Staff" });
  const input = { ...NEW_PERSON, templateIds: [engineering.id, staff.id] };

  const response = await browser.graphql(ADD_PERSON, { input });
  const body = (await response.json()) as {
    data: {
      apps: {
        addPerson: {
          employee: { id: string; templates: { edges: { node: { id: string } }[] } };
        };
      };
    };
  };
  expect(body).toMatchObject({
    data: { apps: { addPerson: { employee: NEW_PERSON, error: null } } },
  });
  const { id, templates } = body.data.apps.addPerson.employee;
  expect(templates.edges.map(({ node }) => node.id).sort()).toEqual([...input.templateIds].sort());
  expect(await createdGoogleUsers(fakeGoogle.url)).toEqual([]);

  await allowGoogleUserWrites(browser, `/people/${id}`);
  const provision = await browser.graphql(
    `mutation ($input: EmployeeProvisionInput!) {
    apps { provisionEmployee(input: $input) { employee { id } error { __typename } } }
  }`,
    { input: { employeeId: id, appIds: [appId] } },
  );
  expect(await provision.json()).toEqual({
    data: { apps: { provisionEmployee: { employee: { id }, error: null } } },
  });

  const expectedChanges = ["Google Workspace", "Linear"].map((name) => ({
    node: {
      email: NEW_PERSON.email,
      action: "INVITE",
      status: "SUCCEEDED",
      startedFrom: "PROVISION",
      app: { name },
    },
  }));
  const activity = `{ accountChanges { edges { node { email action status startedFrom app { name } } } } }`;
  await expect
    .poll(async () => (await browser.graphql(activity)).json(), ACCOUNT_CHANGE_POLL)
    .toMatchObject({
      data: { accountChanges: { edges: expect.arrayContaining(expectedChanges) as unknown } },
    });
  expect(await createdGoogleUsers(fakeGoogle.url)).toEqual([
    { primaryEmail: NEW_PERSON.email, suspended: false, changePasswordAtNextLogin: true },
  ]);
  expect(await linearInvitations(fakeConnectors.url, NEW_PERSON.email)).toHaveLength(1);
  const take = await browser.graphql(TAKE_FIRST_PASSWORD, { id });
  expect(await take.json()).toEqual({
    data: {
      apps: {
        takeFirstPassword: {
          email: NEW_PERSON.email,
          password: expect.stringMatching(/.+/) as unknown,
        },
      },
    },
  });
  const unknown = await browser.graphql(TAKE_FIRST_PASSWORD, {
    id: "00000000-0000-4000-8000-000000000001",
  });
  expect(await unknown.json()).toEqual({
    data: { apps: { takeFirstPassword: { email: null, password: null } } },
  });
  const people = await browser.graphql(
    `query ($email: String!) { employees(filter: { search: $email }) { edges { node { id } } } }`,
    { email: NEW_PERSON.email },
  );
  expect(await people.json()).toEqual({ data: { employees: { edges: [{ node: { id } }] } } });
}, 90_000);

test("the owner corrects a wrong-domain email and can discard the pending person", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithDemoApps(browser);
  const input = { ...NEW_PERSON, templateIds: [] };
  const invalid = await browser.graphql(ADD_PERSON, {
    input: { ...input, email: "robin@other.example" },
  });
  expect(await invalid.json()).toMatchObject({
    data: {
      apps: {
        addPerson: {
          employee: null,
          error: {
            __typename: "InvalidInputError",
            fields: [{ field: "email", code: "wrong_domain" }],
          },
        },
      },
    },
  });
  const saved = await browser.graphql(ADD_PERSON, { input });
  const result = (await saved.json()) as {
    data: { apps: { addPerson: { employee: { id: string } } } };
  };
  expect(result).toMatchObject({ data: { apps: { addPerson: { error: null } } } });

  const deleted = await browser.graphql(
    `mutation ($id: ID!) {
    apps { deletePerson(employeeId: $id) { deleted error { __typename ... on Error { message } } } }
  }`,
    { id: result.data.apps.addPerson.employee.id },
  );

  expect(await deleted.json()).toEqual({
    data: { apps: { deletePerson: { deleted: true, error: null } } },
  });
}, 90_000);

test("editing a pending person's work email returns a typed conflict", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  await finishSetupWithDemoApps(browser);
  const saved = await browser.graphql(ADD_PERSON, { input: { ...NEW_PERSON, templateIds: [] } });
  const result = (await saved.json()) as {
    data: { apps: { addPerson: { employee: { id: string } } } };
  };
  const { id } = result.data.apps.addPerson.employee;

  const response = await browser.graphql(
    `mutation ($input: EmployeeUpdateInput!) {
    employees { update(input: $input) { employee { id } historyLine { id } error { __typename } } }
  }`,
    { input: { id, email: "new-address@acme.example" } },
  );

  expect(await response.json()).toEqual({
    data: {
      employees: {
        update: {
          employee: null,
          historyLine: null,
          error: { __typename: "ConflictError" },
        },
      },
    },
  });
}, 90_000);

const ADD_PERSON = `mutation ($input: AddPersonInput!) {
  apps { addPerson(input: $input) {
    employee { id firstName lastName email templates { edges { node { id } } } provisionSteps { app { id } } }
    error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } }
  } }
}`;

const TAKE_FIRST_PASSWORD = `mutation ($id: ID!) {
  apps { takeFirstPassword(employeeId: $id) { email password } }
}`;
