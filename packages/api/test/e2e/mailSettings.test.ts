import {
  expect,
  RESEND_CHOICE,
  SAVE_MAIL_SETTINGS,
  startMailTestEnv,
  test,
  TEST_OWNER,
} from "#test/support";

test("the owner saves Resend, reads the choice without its key and receives a test email", async () => {
  const { owner, resend } = await startMailTestEnv();

  const saved = await owner.graphql(SAVE_MAIL_SETTINGS, { input: RESEND_CHOICE });

  expect(await saved.json()).toEqual({
    data: {
      system: {
        saveMailSettings: {
          setup: {
            id: "instance",
            mail: {
              id: "mail",
              source: "RESEND_API",
              from: "access@example.com",
              hasSecret: true,
            },
          },
          error: null,
        },
      },
    },
  });
  expect(
    await (await owner.graphql("query { setup { id mail { id source from hasSecret } } }")).json(),
  ).toEqual({
    data: {
      setup: {
        id: "instance",
        mail: { id: "mail", source: "RESEND_API", from: "access@example.com", hasSecret: true },
      },
    },
  });
  const sent = await owner.graphql(`mutation {
    system { sendTestEmail { setup { id } error { __typename ... on Error { message } } } }
  }`);
  expect(await sent.json()).toEqual({
    data: { system: { sendTestEmail: { setup: { id: "instance" }, error: null } } },
  });
  expect(resend.emails).toHaveLength(1);
  expect(resend.emails[0]).toMatchObject({
    headers: { authorization: "Bearer resend-key" },
    body: {
      from: '"Broccoli Access" <access@example.com>',
      to: [TEST_OWNER.email],
      subject: "Broccoli Access can send email",
    },
  });
  expect(resend.emails[0]!.headers["idempotency-key"]).toEqual(expect.any(String));
  expect(resend.emails[0]!.body.text).toContain("This test email");
});
