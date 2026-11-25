import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { PrincipalSecurityContext } from "../../core/security";
import type {
  AccountLinkService,
  AddPersonService,
  AccountChangeService,
  AppService,
  AppUserService,
  ProvisionService,
} from "./app";
import { createResolvers, type ReadEmployees } from "./graphql";
export type { PersonPageScope } from "./ports";

// Public values.
export {
  createAccountLinkService,
  createAddPersonService,
  createAccountChangeService,
  createAppAccountService,
  createAppConnectionService,
  createAppInvitationService,
  createAppService,
  createAppUserService,
  createProvisionService,
} from "./app";

// Public types.
export type {
  AccountLinkService,
  AddPersonService,
  AccountChangeService,
  AppAccountService,
  AppConnectionService,
  AppInvitationService,
  AppService,
  AppUserService,
  ProvisionService,
} from "./app";

/**
 * The apps people use and their users: found by scans or connected, approved or ignored by the
 * owner, their accounts disabled and enabled, and people provisioned with the apps they miss.
 */
export function appsModule(
  services: AppService &
    AppUserService &
    AccountChangeService &
    AccountLinkService &
    AddPersonService &
    ProvisionService,
  people: Parameters<typeof createResolvers>[1],
  differencePeople: Parameters<typeof createResolvers>[2],
  readEmployees: ReadEmployees,
): ModuleManifest {
  return {
    name: "apps",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(services, people, differencePeople, readEmployees),
    jobs: {
      "apps.runAccountChange": {
        run: ({ changeId }) => services.runChange(SYSTEM, changeId),
        onFailed: ({ changeId }) => services.failChange(SYSTEM, changeId),
        expireInSeconds: CHANGE_EXPIRE_SECONDS,
        // One change per connection at a time, in the order asked.
        groupConcurrency: 1,
      },
      "apps.runDirectoryProvision": {
        run: (job) => services.runDirectoryProvision(SYSTEM, job),
        onFailed: ({ changeId }) => services.failChange(SYSTEM, changeId),
        expireInSeconds: CHANGE_EXPIRE_SECONDS,
        groupConcurrency: 1,
      },
      "apps.expireFirstPasswords": {
        run: () => services.expireFirstPasswords(SYSTEM),
        onFailed: () => Promise.resolve(),
        schedule: { cron: "* * * * *", timeZone: "UTC", payload: {} },
      },
    },
  };
}

/** Longer than three attempts of the slowest contract call with their waits, so no change runs twice at once. */
const CHANGE_EXPIRE_SECONDS = 10 * 60;

const SYSTEM = PrincipalSecurityContext.system();
