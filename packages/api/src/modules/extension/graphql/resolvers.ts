import { type Resolvers, signedInUserOf } from "../../../core/graphql";
import type { ExtensionPairingService } from "../app";

export function createResolvers(
  pairings: Pick<ExtensionPairingService, "startPairing" | "readPairing" | "unpair">,
): Resolvers {
  return {
    User: {
      extensionPairing: (_user, _args, context) => pairings.readPairing(context.getActor()),
    },
    Mutation: {
      extension: () => ({}),
    },
    ExtensionMutations: {
      startPairing: (_parent, _args, context) =>
        pairings.startPairing(context.getActor(), { now: new Date() }),
      unpair: async (_parent, _args, context) => {
        const actor = context.getActor();
        await pairings.unpair(actor);
        return { user: signedInUserOf(actor) };
      },
    },
  };
}
