import DataLoader from "dataloader";

import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type { ContainerConnection, ContainerConnectionService } from "../app";

export function createResolvers(connections: ContainerConnectionService): Resolvers {
  const connectionsOfApps = perRequest(
    (context) =>
      new DataLoader<string, ContainerConnection | null>(async (appIds) => {
        const byApp = await connections.readConnectionsOfApps(context.getActor(), appIds);
        return appIds.map((appId) => byApp.get(appId) ?? null);
      }),
  );
  return {
    Query: {
      containerConnectors: (_parent, _args, context) =>
        connections.listConnectors(context.getActor()),
    },
    Mutation: {
      connectors: () => ({}),
    },
    ConnectorsMutations: {
      connect: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["ContainerConnectorConnectPayload"]>(
          async () => ({
            containerConnector: await connections.connect(context.getActor(), input),
          }),
          ["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "UNAVAILABLE"],
        ),
    },
    ContainerConnector: {
      id: ({ connector }) => connector.key,
      name: ({ connector }) => connector.name,
      appDomain: ({ connector }) => connector.appDomain,
      findingKind: ({ connector }) => connector.findingKinds.ownAppAccounts,
      connectionFields: ({ connector }) =>
        connector.connectionFields.map((field) => ({ ...field, kind: toEnum(field.kind) })),
      connection: ({ connection }) => connection,
    },
    ContainerConnection: {
      connector: (connection) => ({ connector: connection.connector, connection }),
    },
    App: {
      containerConnection: (app, _args, context) => connectionsOfApps(context).load(app.id),
    },
  };
}
