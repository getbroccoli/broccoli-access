/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // A mutation namespace holds no data; its field resolves to an empty object.
  ImportsMutations: "Record<PropertyKey, never>",
  // The Google module's connection leaves the field this module adds to its resolvers.
  GoogleWorkspaceConnection: "Omit<GoogleWorkspaceConnection, 'scan'>",
};
