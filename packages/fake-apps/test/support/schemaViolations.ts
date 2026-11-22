import { readFileSync } from "node:fs";

/**
 * Problems of `body` against a schema of a committed copy of Google's discovery documents,
 * so a fake response that drifts from Google's shape fails a test; `[]` when it conforms.
 */
export function schemaViolations(
  api: "directory" | "reports",
  schemaName: string,
  body: unknown,
): string[] {
  return violations({ $ref: schemaName }, body, "$", DISCOVERY_SCHEMAS[api]);
}

/** A schema in Google's discovery format, a dialect of JSON Schema. */
interface DiscoverySchema {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: string[];
  properties?: Record<string, DiscoverySchema>;
  additionalProperties?: DiscoverySchema;
  items?: DiscoverySchema;
}

type Schemas = Record<string, DiscoverySchema>;

const DISCOVERY_SCHEMAS = {
  directory: readSchemas("directoryV1.json"),
  reports: readSchemas("reportsV1.json"),
};

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const INT64 = /^-?\d+$/;

function readSchemas(fileName: string): Schemas {
  const url = new URL(`../../src/google/discovery/${fileName}`, import.meta.url);
  return (JSON.parse(readFileSync(url, "utf8")) as { schemas: Schemas }).schemas;
}

function violations(
  schema: DiscoverySchema,
  value: unknown,
  path: string,
  schemas: Schemas,
): string[] {
  if (schema.$ref !== undefined) return referenceViolations(schema.$ref, value, path, schemas);
  switch (schema.type) {
    case "any":
      return [];
    case "object":
      return objectViolations(schema, value, path, schemas);
    case "array":
      return arrayViolations(schema, value, path, schemas);
    case "string":
      return typeof value === "string"
        ? stringViolations(schema, value, path)
        : [`${path}: expected a string`];
    case "boolean":
      return typeof value === "boolean" ? [] : [`${path}: expected a boolean`];
    case "integer":
      return Number.isInteger(value) ? [] : [`${path}: expected an integer`];
    case "number":
      return typeof value === "number" ? [] : [`${path}: expected a number`];
    default:
      return [`${path}: schema type ${schema.type} is not supported`];
  }
}

function referenceViolations(
  name: string,
  value: unknown,
  path: string,
  schemas: Schemas,
): string[] {
  const schema = schemas[name];
  if (schema === undefined) return [`${path}: schema ${name} is not in the document`];
  return violations(schema, value, path, schemas);
}

function objectViolations(
  schema: DiscoverySchema,
  value: unknown,
  path: string,
  schemas: Schemas,
): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [`${path}: expected an object`];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const property = schema.properties?.[key] ?? schema.additionalProperties;
    if (property === undefined) return [`${path}.${key}: not in the schema`];
    return violations(property, child, `${path}.${key}`, schemas);
  });
}

function arrayViolations(
  schema: DiscoverySchema,
  value: unknown,
  path: string,
  schemas: Schemas,
): string[] {
  if (!Array.isArray(value)) return [`${path}: expected an array`];
  const items = schema.items ?? { type: "any" };
  return value.flatMap((item, index) => violations(items, item, `${path}[${index}]`, schemas));
}

function stringViolations(schema: DiscoverySchema, value: string, path: string): string[] {
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    return [`${path}: ${value} is not one of the schema's values`];
  }
  if (schema.format === "date-time" && !DATE_TIME.test(value)) {
    return [`${path}: expected a date-time`];
  }
  if (schema.format === "int64" && !INT64.test(value)) return [`${path}: expected an int64`];
  return [];
}
