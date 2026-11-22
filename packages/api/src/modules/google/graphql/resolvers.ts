import type { Resolvers } from "../../../core/graphql";
import type { GoogleConnectionService } from "../app";
import { googleRedirectAddress } from "../domain";

export function createResolvers(
  google: Pick<GoogleConnectionService, "readConnection" | "readOrganizationName">,
): Resolvers {
  return {
    Setup: {
      googleRedirectAddress: async (_parent, _args, context) =>
        googleRedirectAddress(await context.publicOrigin()),
      organizationName: () => google.readOrganizationName(),
      googleWorkspace: (_parent, _args, context) => google.readConnection(context.getActor()),
    },
  };
}
