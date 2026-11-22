import { expect, type TestAPI } from "vitest";
import { z } from "zod";

import {
  ConnectorError,
  type Connector,
  type ConnectorErrorCode,
  type ImportedAccount,
} from "../../src/core/connectors";

export interface ConnectorContractCase {
  connector: Connector;
  connection: { settings: unknown; secrets: unknown };
  failAccounts: (error: ConnectorErrorCode) => Promise<void>;
  revokeRefreshTokens: () => Promise<void>;
  expireAccessTokens: () => Promise<void>;
}

/** Each connector supplies its real connection and controls for its external fake. */
export function connectorContract(
  test: TestAPI<{ connectorCase: ConnectorContractCase }>,
  expected: {
    description: Pick<
      Connector,
      "key" | "version" | "name" | "transport" | "findingKinds" | "isDirectory" | "connectionFields"
    >;
    connection: { organizationName: string; domain: string | null };
  },
): void {
  test("describes its connector and accepts its stored settings and secrets", ({
    connectorCase,
  }) => {
    const { connector, connection } = connectorCase;

    expect(connector).toMatchObject(expected.description);
    expect(connector.settings.safeParse(connection.settings).success).toBe(true);
    expect(connector.secrets.safeParse(connection.secrets).success).toBe(true);
  });

  test("tests the connection and returns its organisation and domain", async ({
    connectorCase,
  }) => {
    const session = await connectorCase.connector.openSession(connectorCase.connection);

    expect(await session.testConnection()).toEqual(expected.connection);
  });

  test("pages through accounts with version-one values and unique source keys", async ({
    connectorCase,
  }) => {
    const session = await connectorCase.connector.openSession(connectorCase.connection);

    const accounts: ImportedAccount[] = [];
    let cursor: string | null = null;
    do {
      const page = await session.listAccounts(cursor);
      accounts.push(...page.accounts);
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(accounts.length).toBeGreaterThan(0);
    expect(new Set(accounts.map(({ sourceKey }) => sourceKey)).size).toBe(accounts.length);
    for (const account of accounts) {
      expect(account.sourceKey).not.toBe("");
      expect(account.raw).toEqual(expect.any(Object));
      expect(ACCOUNT_VALUES.safeParse(account.values).success).toBe(true);
      expect(account.values.email).toBe(account.values.email.toLowerCase());
      expect(account.values.managerEmail).toBe(account.values.managerEmail?.toLowerCase() ?? null);
    }
  });

  test.for([
    "authentication_failed",
    "permission_missing",
    "rate_limited",
    "app_unavailable",
    "unexpected_response",
  ] as const)("reports %s without exposing the app response", async (code, { connectorCase }) => {
    const session = await connectorCase.connector.openSession(connectorCase.connection);
    await connectorCase.failAccounts(code);

    const result = session.listAccounts(null);

    await expect(result).rejects.toBeInstanceOf(ConnectorError);
    await expect(result).rejects.toMatchObject({ code, message: `The connector failed: ${code}` });
  });

  test("refuses a revoked refresh token when opening a session", async ({ connectorCase }) => {
    await connectorCase.revokeRefreshTokens();

    const result = connectorCase.connector.openSession(connectorCase.connection);

    await expect(result).rejects.toBeInstanceOf(ConnectorError);
    await expect(result).rejects.toMatchObject({
      code: "authentication_failed",
      message: "The connector failed: authentication_failed",
    });
  });

  test("refuses an expired access token when reading accounts", async ({ connectorCase }) => {
    const session = await connectorCase.connector.openSession(connectorCase.connection);
    await connectorCase.expireAccessTokens();

    const result = session.listAccounts(null);

    await expect(result).rejects.toBeInstanceOf(ConnectorError);
    await expect(result).rejects.toMatchObject({
      code: "authentication_failed",
      message: "The connector failed: authentication_failed",
    });
  });
}

const ACCOUNT_VALUES = z.object({
  email: z.email(),
  status: z.enum(["active", "suspended"]),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  managerEmail: z.email().nullable(),
  appName: z.string(),
  appExternalId: z.string().nullable(),
  grantedAt: z.iso.datetime({ offset: true }).nullable(),
  grantedBefore: z.iso.datetime({ offset: true }).nullable(),
});
