import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import express from "express";

import { createEmployeeReadService, createEmployeeService, employeeRecordType } from "./app";
import { createResolvers } from "./graphql";
import { avatarRouter } from "./http";

// Public values.
export { createEmployeeReadService, createEmployeeService, employeeDirectory } from "./app";

// Public types.
export type { EmployeeReadService, EmployeeService } from "./app";
export type { Employee } from "./domain";

/** The people who work for the company: create, change, remove and list them, keep their history and serve their avatars. */
export function employeesModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact" | "logger">,
): ModuleManifest {
  const services = {
    ...createEmployeeService(dependencies),
    ...createEmployeeReadService(dependencies),
  };
  return {
    name: "employees",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(services),
    recordTypes: { employee: employeeRecordType(dependencies.orm) },
    router: ({ resolveSecurity }) => express.Router().use(avatarRouter(services, resolveSecurity)),
  };
}
