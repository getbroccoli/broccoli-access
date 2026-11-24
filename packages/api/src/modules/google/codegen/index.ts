/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // A mutation namespace holds no data; its field resolves to an empty object.
  GoogleMutations: "Record<PropertyKey, never>",
  // The system module's `Setup` object leaves the fields this module adds to its resolvers.
  Setup: "Omit<Setup, 'googleRedirectAddress' | 'broccoliGoogleAppAvailable'>",
};
