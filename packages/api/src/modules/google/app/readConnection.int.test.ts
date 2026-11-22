import { expect, test, EMPLOYEE, googleConnection } from "#test/support";

test("refuses an employee reading the workspace connection", async ({ orm, fakeGoogle }) => {
  const connection = googleConnection(orm, { googleUrl: fakeGoogle.url });

  await expect(connection.readConnection(EMPLOYEE)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
