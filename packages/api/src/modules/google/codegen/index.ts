/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // The system module's `Setup` object leaves the fields this module adds to its resolvers.
  Setup: "Omit<Setup, 'googleRedirectAddress'>",
};
