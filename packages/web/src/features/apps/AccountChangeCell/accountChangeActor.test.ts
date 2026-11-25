import { describe, expect, it } from "vitest";

import type { AppSessionSource } from "@/__generated__/graphql";

import { accountChangeActor } from "./accountChangeActor";

describe("accountChangeActor", () => {
  it.each([
    ["SERVER_SIGN_IN", "as the integration user"],
    ["EXTENSION", "with your Slack admin session"],
  ] satisfies [AppSessionSource, string][])(
    "names the actor for a %s session",
    (sessionFrom, copy) => {
      const actor = accountChangeActor({
        name: "Slack",
        containerConnection: {
          sessionFrom,
          connector: {
            connectionFields: [{ label: "Slack admin session", secret: true }],
          },
        },
      });

      expect(actor).toBe(copy);
    },
  );

  it("names the connector's credential for a key connection", () => {
    const actor = accountChangeActor({
      name: "Linear",
      containerConnection: {
        sessionFrom: null,
        connector: {
          connectionFields: [{ label: "Personal API key", secret: true }],
        },
      },
    });

    expect(actor).toBe("with your personal API key");
  });

  it("returns no actor copy when the connector has no session or connection fields", () => {
    const actor = accountChangeActor({
      name: "Linear",
      containerConnection: { sessionFrom: null, connector: { connectionFields: [] } },
    });

    expect(actor).toBeNull();
  });

  it("returns no actor copy for an app without a container connection", () => {
    expect(accountChangeActor({ name: "Google Workspace", containerConnection: null })).toBeNull();
  });
});
