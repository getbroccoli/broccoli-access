import { expect, it, type TestContext } from "vitest";

import { CONNECTION_SIGN_IN_ANSWER, CONNECTOR_ERROR_ANSWER } from "../connectorCalls.js";
import type { ConnectorFixture } from "./describeConnectorConformance.js";
import { call, listAll, skipUnlessListed, withinDeadline } from "./flow.js";

/** The errors a fixture makes the app show to the integration user's sign-in. */
export const SIGN_IN_ERROR_CODES = [
  "not_invited",
  "permission_missing",
  "blocked_by_check",
] as const;

/** The sign-in checks of one connector; a connector that does not list `sign_in` skips them. */
export function describeSignInConformance(url: string, fixture: ConnectorFixture): void {
  it("signs in as the integration user, with a connection that the list accepts", async ({
    skip,
  }) => checkSignIn(url, fixture, await signInOf(url, fixture, skip)));
  it.for(SIGN_IN_ERROR_CODES)(
    "answers %s from the sign-in, when the fixture causes it, as that error",
    async (code, { skip }) => {
      const signIn = await signInOf(url, fixture, skip);
      await withinDeadline(signIn.causeError(url, code), "the fixture's signIn.causeError");

      const answer = await signInAs(url, fixture, signIn);

      expect(CONNECTOR_ERROR_ANSWER.parse(answer).error.code).toBe(code);
    },
  );
}

type SignIn = NonNullable<ConnectorFixture["signIn"]>;

/** The integration user calls sign in through several pages (contract "Answers"). */
const SIGN_IN_TIMEOUT_MS = 180_000;

async function checkSignIn(url: string, fixture: ConnectorFixture, signIn: SignIn): Promise<void> {
  const answer = CONNECTION_SIGN_IN_ANSWER.parse(await signInAs(url, fixture, signIn));

  // Listing parses every page, so an error answer fails here.
  const accounts = await listAll({ url, fixture, connection: answer.connection });

  expect(accounts.length).toBeGreaterThan(0);
}

/** The first sign-in, without a stored connection. */
function signInAs(url: string, fixture: ConnectorFixture, signIn: SignIn): Promise<unknown> {
  const body = {
    connector: fixture.connector,
    integrationUser: signIn.integrationUser,
    connection: null,
  };
  return call(url, "connections/sign-in", body, SIGN_IN_TIMEOUT_MS);
}

/**
 * The fixture's sign-in, which a connector that lists `sign_in` must have; skips the check for
 * any other connector.
 */
async function signInOf(
  url: string,
  fixture: ConnectorFixture,
  skip: TestContext["skip"],
): Promise<SignIn> {
  await skipUnlessListed(url, fixture, "sign_in", skip);
  const message = `${fixture.connector} lists sign_in, so its fixture needs signIn`;
  expect(fixture.signIn, message).toBeDefined();
  return fixture.signIn!;
}
