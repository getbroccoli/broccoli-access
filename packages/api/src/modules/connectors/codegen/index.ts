/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // A mutation namespace holds no data; its field resolves to an empty object.
  ConnectorsMutations: "Record<PropertyKey, never>",
  ContainerConnector:
    "../../modules/connectors/app#ConnectorWithConnection as ContainerConnectorModel",
  ContainerConnection:
    "../../modules/connectors/app#ContainerConnection as ContainerConnectionModel",
};
