import { expect, it } from "vitest";

import { changedFields, toUpdateInput, type EmployeeValues } from "./employeeDraft";

it("leaves saved fields unchanged when they are absent from the draft", () => {
  const fields = changedFields(saved, {});

  expect(fields).toEqual([]);
});

it("removes a change when its draft value matches the saved value", () => {
  const fields = changedFields(saved, { firstName: "Avery" });

  expect(fields).toEqual([]);
});

it("includes clearing a saved value as a change", () => {
  const fields = changedFields(saved, { email: "" });

  expect(fields).toEqual(["email"]);
});

it("returns changed fields in employee field order", () => {
  const fields = changedFields(saved, {
    email: "avery.chen@example.com",
    lastName: "Chen",
    firstName: "Robin",
  });

  expect(fields).toEqual(["firstName", "lastName", "email"]);
});

it("sends the id and only fields that changed", () => {
  const input = toUpdateInput("employee-1", saved, { firstName: "Avery", lastName: "Chen" }, "");

  expect(input).toStrictEqual({ id: "employee-1", lastName: "Chen" });
});

it("sends a cleared field as null", () => {
  const input = toUpdateInput("employee-1", saved, { email: "" }, "");

  expect(input).toStrictEqual({ id: "employee-1", email: null });
});

it("trims the change reason before sending it", () => {
  const input = toUpdateInput("employee-1", saved, { lastName: "Chen" }, "  Married  ");

  expect(input).toStrictEqual({ id: "employee-1", lastName: "Chen", changeReason: "Married" });
});

it("omits a blank change reason", () => {
  const input = toUpdateInput("employee-1", saved, { lastName: "Chen" }, "  \n ");

  expect(input).toStrictEqual({ id: "employee-1", lastName: "Chen" });
});

const saved: EmployeeValues = {
  firstName: "Avery",
  lastName: "Morgan",
  email: "avery@example.com",
};
