/** Resolver parent types for codegen; paths are relative to `src/core/graphql/resolvers.gen.ts`. */
export const codegenMappers = {
  // A mutation namespace holds no data; its field resolves to an empty object.
  TemplatesMutations: "Record<PropertyKey, never>",
  Template: "../../modules/templates/domain#Template as TemplateModel",
  TemplateApp: "../../modules/templates/domain#TemplateApp as TemplateAppModel",
};
