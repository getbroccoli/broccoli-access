import { type Resolvers, toEnum } from "../../../core/graphql";
import type { SecurityContext } from "../../../core/security";
import type { GoogleConnectionService, IntegrationUserService } from "../app";
import { googleRedirectAddress } from "../domain";

export function createResolvers(
  google: Pick<GoogleConnectionService, "readConnection" | "readOrganization">,
  broccoliGoogleAppAvailable: boolean,
  integrationUsers: Pick<IntegrationUserService, "readIntegrationUser" | "startSignIn">,
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
      integrationUser: (_parent, _args, context) =>
        readIntegrationUser(integrationUsers, context.getActor()),
    },
    Mutation: {
      google: () => ({}),
    },
    GoogleMutations: {
      signInAsIntegrationUser: async (_parent, _args, context) => {
        const actor = context.getActor();
        await integrationUsers.startSignIn(actor);
        return { integrationUser: await readIntegrationUser(integrationUsers, actor) };
      },
    },
  };
}

/** The integration user in the schema's shape, its sign-in as two fields. */
async function readIntegrationUser(
  integrationUsers: Pick<IntegrationUserService, "readIntegrationUser">,
  actor: SecurityContext,
) {
  const found = await integrationUsers.readIntegrationUser(actor);
  return (
    found && {
      id: found.id,
      email: found.email,
      signInStatus: toEnum(found.signIn.status),
      signInFailure: found.signIn.failure && toEnum(found.signIn.failure),
    }
  );
}
