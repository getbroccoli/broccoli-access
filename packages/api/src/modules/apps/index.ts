import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { PrincipalSecurityContext } from "../../core/security";
import type { AccountChangeService, AppService, AppUserService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export {
  createAccountChangeService,
  createAppAccountService,
  createAppConnectionService,
  createAppInvitationService,
  createAppService,
  createAppUserService,
} from "./app";

// Public types.
export type {
  AccountChangeService,
  AppAccountService,
  AppConnectionService,
  AppInvitationService,
  AppService,
  AppUserService,
} from "./app";

/**
 * The apps people use and their users: found by scans or connected, approved or ignored by the
 * owner, and their accounts disabled and enabled.
 */
export function appsModule(
  services: AppService & AppUserService & AccountChangeService,
): ModuleManifest {
  return {
    name: "apps",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(services),
    jobs: {
      "apps.runAccountChange": {
        run: ({ changeId }) => services.runChange(SYSTEM, changeId),
        onFailed: ({ changeId }) => services.failChange(SYSTEM, changeId),
        expireInSeconds: CHANGE_EXPIRE_SECONDS,
        // One change per connection at a time, in the order asked.
        groupConcurrency: 1,
      },
    },
  };
}

/** Longer than three attempts of the slowest contract call with their waits, so no change runs twice at once. */
const CHANGE_EXPIRE_SECONDS = 10 * 60;

const SYSTEM = PrincipalSecurityContext.system();
