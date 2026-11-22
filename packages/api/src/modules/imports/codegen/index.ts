/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // The Google module's connection leaves the field this module adds to its resolvers.
  GoogleWorkspaceConnection: "Omit<GoogleWorkspaceConnection, 'scan'>",
};
