import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import express from "express";

import { createEmployeeReadService, createEmployeeService, employeeRecordType } from "./app";
import { createResolvers } from "./graphql";
import { avatarRouter } from "./http";
import type { EmployeeAccounts } from "./ports";

// Public values.
export {
  createDirectorySyncService,
  createEmployeeReadService,
  createEmployeeService,
  employeeDirectory,
} from "./app";

// Public types.
export type { DirectorySyncService, EmployeeReadService, EmployeeService } from "./app";
export type { Employee } from "./domain";

/**
 * The people who work for the company: create, change, remove and list them with their status
 * and apps, keep their history and serve their avatars.
 */
export function employeesModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact" | "logger"> & {
    accounts: EmployeeAccounts;
  },
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
