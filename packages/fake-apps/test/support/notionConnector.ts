import { once } from "node:events";
import type { AddressInfo } from "node:net";

import {
  ACTION_RUN_REQUEST,
  CONNECTION_TEST_REQUEST,
  type ActionRunRequest,
  type ConnectorDescription,
  type ConnectorErrorCode,
  type ListedAccount,
} from "@broccoli-access/connector-contract";
import express from "express";

import { ACME } from "../../src/seed";

export const NOTION_CONNECTION = { settings: {}, secrets: { apiKey: "acme-notion-test-key" } };
export type NotionAction = "invite" | "remove";

/** A fresh Acme Notion connector on a free port. Only the test can reset it or arm an error. */
export async function startNotionConnector(
  actions: readonly NotionAction[] = ["invite", "remove"],
  ownMember: string | null = "david@acme.example",
  { host = "127.0.0.1", port = 0 } = {},
) {
  const seed = notionMembers(ownMember);
  let members = [...seed];
  const invitations = new Set<string>();
  let nextError: ConnectorErrorCode | undefined;
  // Only this operation can return an armed error, so an incorrect conformance route fails.
  const errorOperation = actions.includes("invite")
    ? "invite"
    : actions.includes("remove")
      ? "remove"
      : "list";
  const app = express();
  app.get("/v1/connectors", (_request, response) => {
    response.json({ connectors: [description(actions)] });
  });
  app.use(express.json(), (request, response, next) => {
    const call = CONNECTION_TEST_REQUEST.safeParse(request.body);
    if (!call.success || call.data.connector !== "notion" || call.data.runtime.kind !== "server")
      return response.sendStatus(400);
    if (call.data.connection.secrets.apiKey !== NOTION_CONNECTION.secrets.apiKey)
      return response.json({ error: { code: "authentication_failed" } });
    next();
  });
  app.post("/v1/connections/test", (_request, response) => {
    response.json({
      details: { organizationName: ACME.customer.organizationName, domain: ACME.customer.domain },
    });
  });
  app.post("/v1/accounts/list", (_request, response) => {
    response.json(takeError("list") ?? { accounts: members, nextCursor: null });
  });
  app.post("/v1/actions/run", (request, response) => {
    const call = ACTION_RUN_REQUEST.safeParse(request.body);
    if (!call.success || !actions.some((action) => action === call.data.action))
      return response.sendStatus(400);
    response.json(takeError(call.data.action) ?? changeMember(call.data, members, invitations));
  });
  const server = app.listen(port, host);
  await once(server, "listening");
  return {
    url: `http://${host}:${(server.address() as AddressInfo).port}`,
    stop: () => server[Symbol.asyncDispose](),
    memberToRemove: { sourceKey: seed[0]!.sourceKey, email: seed[0]!.values.email },
    reset() {
      members = [...seed];
      invitations.clear();
      nextError = undefined;
    },
    causeError(code: ConnectorErrorCode) {
      nextError = code;
    },
  };

  function takeError(operation: string) {
    if (operation !== errorOperation || !nextError) return;
    const code = nextError;
    nextError = undefined;
    return { error: { code } };
  }
}

function description(actions: readonly NotionAction[]): ConnectorDescription {
  return {
    key: "notion",
    name: "Notion",
    version: 1,
    appDomain: "notion.so",
    runtimes: ["server"],
    capabilities: ["list_accounts", ...actions],
    findingKind: "notion_members",
    connectionFields: [
      {
        key: "apiKey",
        kind: "text",
        label: "API key",
        help: "Enter the Acme test key.",
        secret: true,
      },
    ],
    notice: null,
    adminUrl: "https://www.notion.so/settings",
  };
}

function notionMembers(ownMember: string | null): ListedAccount[] {
  return ["chloe", "david", "ana"].map((name) => {
    const person = ACME.people.find(({ email }) => email === `${name}@acme.example`)!;
    return {
      sourceKey: `notion-${person.id}`,
      raw: {},
      values: {
        email: person.email,
        displayName: `${person.givenName} ${person.familyName}`,
        status: "active",
        isConnectionUser: person.email === ownMember,
      },
    };
  });
}

function changeMember(call: ActionRunRequest, members: ListedAccount[], invitations: Set<string>) {
  const { email } = call.account;
  const member = members.find(({ values }) => values.email === email);
  if (call.action === "invite") {
    if (member) return { changed: false, account: member };
    const changed = !invitations.has(email);
    invitations.add(email);
    return { changed, invitation: { email, invitedAt: null, expiresAt: null } };
  }
  if (member?.values.isConnectionUser) return { error: { code: "not_allowed" } };
  if (member && member.sourceKey !== call.account.sourceKey)
    return { error: { code: "account_not_found" } };
  if (member) members.splice(members.indexOf(member), 1);
  return { changed: !!member, removed: true };
}

if (import.meta.main) {
  const notion = await startNotionConnector(undefined, undefined, {
    host: process.env.NOTION_TEST_HOST,
    port: Number(process.env.NOTION_TEST_PORT ?? 0),
  });
  process.stdout.write(
    `CONNECTORS_URL=${notion.url}\nNotion API key: ${NOTION_CONNECTION.secrets.apiKey}\n`,
  );
}
