import {
  ACCOUNT_CHANGE_POLL,
  connectedLinear,
  connectorTest as test,
  expect,
  linearInvitations,
  type Browser,
} from "#test/support";

test("the owner invites Ivan to Linear and Linear holds one invitation for him", async ({
  env,
  fakeConnectors,
}) => {
  const { browser, appId } = await connectedLinear(env);
  const ivan = await readIvan(browser);
  expect(ivan.appInvites).toMatchObject([
    {
      app: { id: appId },
      employee: { id: ivan.id },
      offered: true,
      offersReconnect: false,
      latestInvite: null,
      invitedAt: null,
    },
  ]);

  const response = await browser.graphql(INVITE_EMPLOYEE, {
    input: { employeeId: ivan.id, appId },
  });
  expect(await response.json()).toEqual({
    data: {
      apps: {
        inviteEmployee: {
          appInvite: {
            id: ivan.appInvites[0]!.id,
            offered: false,
            latestInvite: { action: "INVITE", status: "RUNNING" },
          },
          error: null,
        },
      },
    },
  });

  await expect
    .poll(async () => (await readIvan(browser)).appInvites, ACCOUNT_CHANGE_POLL)
    .toMatchObject([
      {
        id: ivan.appInvites[0]!.id,
        offered: false,
        latestInvite: { status: "SUCCEEDED" },
        invitedAt: expect.any(String) as unknown,
      },
    ]);
  expect(await linearInvitations(fakeConnectors.url, "ivan@acme.example")).toHaveLength(1);
}, 90_000);

test("refuses an invite without a session", async ({ env }) => {
  const response = await env.browser().graphql(INVITE_EMPLOYEE, {
    input: {
      employeeId: "00000000-0000-4000-8000-000000000001",
      appId: "00000000-0000-4000-8000-000000000002",
    },
  });

  expect(await response.json()).toHaveProperty("errors.0.extensions", {
    code: "UNAUTHENTICATED",
    fieldErrors: [],
  });
});

const INVITE_EMPLOYEE = `mutation ($input: AppInviteInput!) {
  apps { inviteEmployee(input: $input) {
    appInvite { id offered latestInvite { action status } }
    error { __typename ... on Error { message } }
  } }
}`;

async function readIvan(browser: Browser) {
  const response = await browser.graphql(`{
    employees(filter: { search: "ivan@acme.example" }) { edges { node {
      id appInvites { id app { id } employee { id } offered offersReconnect invitedAt latestInvite { status } }
    } } }
  }`);
  const body = (await response.json()) as {
    data: { employees: { edges: { node: { id: string; appInvites: { id: string }[] } }[] } };
  };
  expect(body).not.toHaveProperty("errors");
  return body.data.employees.edges[0]!.node;
}
