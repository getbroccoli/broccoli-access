import { isRedirect } from "@tanstack/react-router";
import { assert, expect, it } from "vitest";

import { requireFinishedSetup, requireSetupPage, setupStepPage } from "./setupSteps";

it.each([
  ["CONNECT_GOOGLE", "/setup"],
  ["SCAN", "/setup/scan"],
  ["DONE", "/"],
] as const)("enters %s through %s", (step, expected) => {
  expect(setupStepPage(step)).toBe(expected);
});

it("sends a signed-out visitor without setup to login with their destination", () => {
  const href = "/setup?from=email";
  let caught: unknown;

  try {
    requireSetupPage("connect_google", {
      context: { me: null, holdsSetup: false, setupStep: "CONNECT_GOOGLE" },
      location: { href },
    });
  } catch (error) {
    caught = error;
  }

  assert(isRedirect(caught));
  expect(caught.options).toMatchObject({
    to: "/login",
    search: { redirect: href },
    replace: true,
  });
});

it("opens the connect step for the browser holding setup", () => {
  const result = requireSetupPage("connect_google", {
    context: { me: null, holdsSetup: true, setupStep: "CONNECT_GOOGLE" },
    location: { href: "/setup" },
  });

  expect(result).toBeUndefined();
});

it("sends a signed-in owner opening setup once it is done to Today", () => {
  let caught: unknown;

  try {
    requireSetupPage("connect_google", {
      context: { me: { id: "owner" }, holdsSetup: false, setupStep: "DONE" },
      location: { href: "/setup" },
    });
  } catch (error) {
    caught = error;
  }

  assert(isRedirect(caught));
  expect(caught.options).toMatchObject({ to: "/", replace: true });
});

it("returns the signed-in user when setup is done", () => {
  const me = { id: "owner" };

  const result = requireFinishedSetup({
    context: { me, holdsSetup: false, setupStep: "DONE" },
    location: { href: "/people" },
  });

  expect(result).toBe(me);
});

it("sends the setup holder to the connect step before entering the app", () => {
  let caught: unknown;

  try {
    requireFinishedSetup({
      context: { me: null, holdsSetup: true, setupStep: "CONNECT_GOOGLE" },
      location: { href: "/people" },
    });
  } catch (error) {
    caught = error;
  }

  assert(isRedirect(caught));
  expect(caught.options).toMatchObject({ to: "/setup", replace: true });
});

it.each([
  ["CONNECT_GOOGLE", false],
  ["DONE", false],
  ["DONE", true],
] as const)("sends a signed-out user at %s to login with holder %s", (setupStep, holdsSetup) => {
  const href = "/people?search=alex";
  let caught: unknown;

  try {
    requireFinishedSetup({
      context: { me: null, holdsSetup, setupStep },
      location: { href },
    });
  } catch (error) {
    caught = error;
  }

  assert(isRedirect(caught));
  expect(caught.options).toMatchObject({
    to: "/login",
    search: { redirect: href },
    replace: true,
  });
});

it("opens scan for the signed-in owner", () => {
  expect(
    requireSetupPage("scan", {
      context: { me: { id: "owner" }, holdsSetup: false, setupStep: "SCAN" },
      location: { href: "/setup/scan" },
    }),
  ).toBeUndefined();
});

it("sends a connected owner from Connect to Scan", () => {
  let caught: unknown;
  try {
    requireSetupPage("connect_google", {
      context: { me: { id: "owner" }, holdsSetup: false, setupStep: "SCAN" },
      location: { href: "/setup" },
    });
  } catch (error) {
    caught = error;
  }

  assert(isRedirect(caught));
  expect(caught.options).toMatchObject({ to: "/setup/scan", replace: true });
});
