import type { CodegenConfig } from "@graphql-codegen/cli";

import { codegenMappers as recordMappers } from "./src/core/records/codegen";
import { codegenMappers as appMappers } from "./src/modules/apps/codegen";
import { codegenMappers as employeeMappers } from "./src/modules/employees/codegen";
import { codegenMappers as googleMappers } from "./src/modules/google/codegen";
import { codegenMappers as importMappers } from "./src/modules/imports/codegen";
import { codegenMappers as systemMappers } from "./src/modules/system/codegen";

const config: CodegenConfig = {
  schema: "src/**/*.graphql",
  generates: {
    "src/core/graphql/resolvers.gen.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        useTypeImports: true,
        strictScalars: true,
        enumsAsTypes: true,
        scalars: { Date: "string", DateTime: "Date" },
        contextType: "./apollo#GraphqlContext",
        // Each module owns its mappers; they meet only in this one generated file.
        mappers: {
          ...appMappers,
          ...employeeMappers,
          ...googleMappers,
          ...importMappers,
          ...systemMappers,
          ...recordMappers,
        },
      },
    },
  },
};

export default config;
