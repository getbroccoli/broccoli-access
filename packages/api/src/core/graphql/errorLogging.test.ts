import { ApolloServer } from "@apollo/server";
import { assert, expect, it, onTestFinished, test } from "vitest";

import { createLogger } from "../logger";
import { errorLoggingPlugin } from "./errorLogging";

it("logs a rejected variable without its input values", async () => {
  const lines: string[] = [];
  const logger = createLogger("debug", {
    write: (line) => {
      lines.push(line);
    },
  });
  const server = new ApolloServer({
    typeDefs: `
      input SecretInput { enabled: Boolean! apiKey: String }
      type Query { choose(input: SecretInput!): Boolean }
    `,
    plugins: [errorLoggingPlugin(logger)],
  });
  onTestFinished(() => server.stop());

  const response = await server.executeOperation({
    query: "query ($input: SecretInput!) { choose(input: $input) }",
    variables: {
      input: { apiKey: "sk-synthetic-secret" },
    },
  });

  assert(response.body.kind === "single");
  expect(response.body.singleResult.errors).toHaveLength(1);
  expect(lines.join("\n")).toContain("GraphQL request rejected");
  expect(lines.join("\n")).not.toContain("sk-synthetic-secret");
});

test.for([
  'query { choose(input: { apiKey "sk-synthetic-secret" }) }',
  'query { choose(input: { apiKey "\\"sk-synthetic-secret\\"" }) }',
  'query { choose(input: { apiKey """prefix "sk-synthetic-secret" suffix""" }) }',
])("logs a syntax error without its inline key (%s)", async (query) => {
  const lines: string[] = [];
  const logger = createLogger("debug", {
    write: (line) => {
      lines.push(line);
    },
  });
  const server = new ApolloServer({
    typeDefs: `
      input SecretInput { apiKey: String }
      type Query { choose(input: SecretInput!): Boolean }
    `,
    plugins: [errorLoggingPlugin(logger)],
  });
  onTestFinished(() => server.stop());

  const response = await server.executeOperation({
    query,
  });

  assert(response.body.kind === "single");
  expect(response.body.singleResult.errors).toHaveLength(1);
  expect(response.body.singleResult.errors?.[0]?.message).toContain("Syntax Error");
  expect(lines.join("\n")).toContain("GraphQL request rejected");
  expect(lines.join("\n")).not.toContain("sk-synthetic-secret");
});
