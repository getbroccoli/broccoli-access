import type { BetterAuthPlugin } from "better-auth";
import type express from "express";

import type { BeforeCommitHandler, Orm, Transact } from "./db";
import type { EventHandlers } from "./events";
import type { JobHandlers, JobQueue } from "./jobs";
import type { Resolvers } from "./graphql";
import type { EmployeeDirectory, SecurityResolver } from "./security";
import type { Logger } from "./logger";
import type { RecordTypeRegistry } from "./records";
import type { SecretBox } from "./secrets";

/**
 * The core's services for the modules. Each module factory takes only the ones it
 * uses (`Pick<ModuleDependencies, "orm">`) plus its own settings.
 */
export interface ModuleDependencies {
  dataDir: string;
  orm: Orm;
  transact: Transact;
  logger: Logger;
  /** Encrypts credentials the database stores, with the instance's encryption key. */
  secretBox: SecretBox;
  /** Queues background jobs inside a transaction. */
  jobs: JobQueue;
}

/**
 * Everything a module contributes to the API. The core iterates over the list of
 * manifests, so adding a module never means editing core code.
 */
export interface ModuleManifest {
  name: string;
  /** The module's GraphQL SDL. */
  typeDefs: string;
  resolvers: Resolvers;
  /** What the module does when another module's event happens. */
  events?: EventHandlers;
  /** What the module does with a transaction's events inside it, committing with them or not at all. */
  eventsBeforeCommit?: BeforeCommitHandler;
  /** The record types the module owns that keep history: who may read it and how to load them. */
  recordTypes?: RecordTypeRegistry;
  /** The module's background jobs, run as the system. */
  jobs?: JobHandlers;
  /** HTTP routes under `/api/` that GraphQL cannot serve, such as images and Google's redirects. */
  router?: (http: ModuleHttp) => express.Router;
  /** Endpoints under `/api/auth/` that sign people in; the module's router mounts first. */
  authPlugin?: BetterAuthPlugin;
}

/** What a module's HTTP routes get from the server. */
export interface ModuleHttp {
  resolveSecurity: SecurityResolver;
  /** The origin browsers reach the instance at. */
  publicOrigin: (request: express.Request) => Promise<string>;
  /** Signs in a user the module has verified; returns the `Set-Cookie` headers for its response. */
  startSession: (userId: string) => Promise<string[]>;
}

/** Every module of the API, and what setup and sign-in need from them. */
export interface Modules {
  manifests: readonly ModuleManifest[];
  /** What permission checks read about people. */
  employeeDirectory: EmployeeDirectory;
}
