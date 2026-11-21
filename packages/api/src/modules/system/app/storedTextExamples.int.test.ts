import { expect, storedTextProbe, storedTextSnapshot, test } from "#test/support";

test.for(["employee.create.firstName", "employee.reason.update"])(
  "%s refuses NUL without changing storage",
  async (entry, { orm, seed }) => {
    // Arrange
    const probe = await storedTextProbe(orm, seed, entry, "\0");
    const before = await storedTextSnapshot(orm);

    // Act / Assert
    await expect(probe.act()).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await storedTextSnapshot(orm)).toEqual(before);
  },
);

test.for([
  "employee.update.firstName",
  "employee.create.firstName",
  "employee.reason.update",
  "mail.secret",
])("%s stores a lone surrogate as U+FFFD", async (entry, { orm, seed }) => {
  // Arrange
  const value = "\ud800";
  const probe = await storedTextProbe(orm, seed, entry, value);

  // Act
  await probe.act();

  // Assert
  expect(await probe.read()).toBe(value.toWellFormed());
});
