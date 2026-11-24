/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // A mutation namespace holds no data; its field resolves to an empty object.
  AppsMutations: "Record<PropertyKey, never>",
  App: "../../modules/apps/app#AppSummary as AppModel",
  AppUser: "../../modules/apps/app#AppUser as AppUserModel",
  AppInvite: "../../modules/apps/app#AppInvite as AppInviteModel",
  AccountChange: "../../modules/apps/app#LatestAccountChange as AccountChangeModel",
};
