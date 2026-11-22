/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // A mutation namespace holds no data; its field resolves to an empty object.
  ExtensionMutations: "Record<PropertyKey, never>",
  // The system module's `User` object leaves the field this module adds to its resolvers.
  User: "Omit<User, 'extensionPairing'>",
};
