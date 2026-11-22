import DataLoader from "dataloader";

import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type {
  ConnectorWithConnection,
  ContainerConnection,
  ContainerConnectionService,
} from "../app";

export function createResolvers(connections: ContainerConnectionService): Resolvers {
  const connectionsOfApps = perRequest(
    (context) =>
      new DataLoader<string, ContainerConnection | null>(async (appIds) => {
        const byApp = await connections.readConnectionsOfApps(context.getActor(), appIds);
        return appIds.map((appId) => byApp.get(appId) ?? null);
      }),
  );
  const managingConnectorsOfApps = perRequest(
    (context) =>
      new DataLoader<string, ConnectorWithConnection | null>(async (catalogKeys) => {
        const byKey = await connections.readManagingConnectors(context.getActor(), catalogKeys);
        return catalogKeys.map((catalogKey) => byKey.get(catalogKey) ?? null);
      }),
  );
  return {
    Query: {
      containerConnectors: (_parent, _args, context) =>
        connections.listConnectors(context.getActor()),
      appsToConnect: (_parent, _args, context) => connections.listAppsToConnect(context.getActor()),
      appSessionHandOver: (_parent, { id }, context) =>
        connections.readAppSessionHandOver(context.getActor(), id),
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
      notice: ({ connector }) => connector.notice,
      connectionFields: ({ connector }) =>
        connector.connectionFields.map((field) => ({ ...field, kind: toEnum(field.kind) })),
      connection: ({ connection }) => connection,
    },
    ContainerConnection: {
      connector: (connection) => ({ connector: connection.connector, connection }),
    },
    AppSessionHandOver: {
      id: ({ requestId }) => requestId,
    },
    App: {
      containerConnection: (app, _args, context) => connectionsOfApps(context).load(app.id),
      managingConnector: (app, _args, context) =>
        app.catalogKey ? managingConnectorsOfApps(context).load(app.catalogKey) : null,
    },
    AppToConnect: {
      id: ({ catalogKey }) => catalogKey,
      // An app to connect has no connection: connecting it adds the app.
      connector: ({ connector }) => ({ connector, connection: null }),
    },
  };
}
