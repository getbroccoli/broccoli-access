import { type Resolvers, toEnum } from "../../../core/graphql";
import type { GoogleConnectionService } from "../app";
import { googleRedirectAddress } from "../domain";

export function createResolvers(
  google: Pick<GoogleConnectionService, "readConnection" | "readOrganization">,
  broccoliGoogleAppAvailable: boolean,
): Resolvers {
  return {
    Setup: {
      broccoliGoogleAppAvailable: () => broccoliGoogleAppAvailable,
      googleRedirectAddress: async (_parent, _args, context) =>
        googleRedirectAddress(await context.publicOrigin()),
      organizationName: async () => (await google.readOrganization())?.name ?? null,
      organizationDomain: async () => (await google.readOrganization())?.domain ?? null,
      googleWorkspace: async (_parent, _args, context) => {
        const connection = await google.readConnection(context.getActor());
        return connection && { ...connection, googleApp: toEnum(connection.googleApp) };
      },
    },
  };
}
