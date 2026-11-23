import {
  ACCOUNT_CHANGE_POLL,
  changeAccount,
  connectedLinear,
  connectorTest as test,
  expect,
  failLinearCall,
  linearUsers,
} from "#test/support";

test("the owner sees why Ana's Linear Disable failed and marks it done by hand", async ({
  env,
  fakeConnectors,
}) => {
  const { browser, appId, owner } = await connectedLinear(env);
  const ana = (await linearUsers(browser, appId)).find(
    (user) => user.employee.email === "ana@acme.example",
  )!;
  await failLinearCall(fakeConnectors.url, "actions/run", "unexpected_response");

  const disable = await changeAccount(browser, ana.id, "SUSPEND");
  const changeId = disable.latestChange!.id;
  await expect
    .poll(async () => {
      const response = await browser.graphql(
        `query ($id: ID!) {
          app(id: $id) {
            suspendedWithAccessCount
            users {
              id status employee { status }
              latestChange { id status failure requestedAt requestedBy { id name } }
            }
          }
        }`,
        { id: appId },
      );
      return response.json();
    }, ACCOUNT_CHANGE_POLL)
    .toMatchObject({
      data: {
        app: {
          suspendedWithAccessCount: 1,
          users: expect.arrayContaining([
            {
              id: ana.id,
              status: "ACTIVE",
              employee: { status: "SUSPENDED" },
              latestChange: {
                id: changeId,
                status: "FAILED",
                failure: "UNEXPECTED_RESPONSE",
                requestedAt: expect.any(String) as unknown,
                requestedBy: { id: owner.id, name: "Mia Novak" },
              },
            },
          ]) as unknown,
        },
      },
    });

  const done = await browser.graphql(
    `mutation ($id: ID!) {
      apps {
        markAccountChangeDoneByHand(input: { id: $id }) {
          appUser { id status latestChange { id status failure } app { suspendedWithAccessCount } }
          error { __typename }
        }
      }
    }`,
    { id: changeId },
  );

  expect(await done.json()).toEqual({
    data: {
      apps: {
        markAccountChangeDoneByHand: {
          error: null,
          appUser: {
            id: ana.id,
            status: "SUSPENDED",
            latestChange: { id: changeId, status: "DONE_BY_HAND", failure: "UNEXPECTED_RESPONSE" },
            app: { suspendedWithAccessCount: 0 },
          },
        },
      },
    },
  });
}, 90_000);
