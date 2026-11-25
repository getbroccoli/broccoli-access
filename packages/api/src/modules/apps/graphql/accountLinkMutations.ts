import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type { AccountLinkService } from "../app";

/** Owner decisions on accounts without a person. */
export function accountLinkMutations(
  services: AccountLinkService,
): Pick<
  NonNullable<Resolvers["AppsMutations"]>,
  "linkAccount" | "markAccount" | "editAccountNote"
> {
  return {
    markAccount: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["MarkedAccountPayload"]>(
        async () => ({
          account: await services.markAccount(context.getActor(), {
            ...input,
            kind: input.kind === "SERVICE" ? "service" : "external",
          }),
        }),
        ["NOT_FOUND", "CONFLICT", "INVALID_INPUT"],
      ),
    editAccountNote: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["MarkedAccountPayload"]>(
        async () => ({
          account: await services.editAccountNote(context.getActor(), input),
        }),
        ["NOT_FOUND", "CONFLICT", "INVALID_INPUT"],
      ),
    linkAccount: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["AppAccountLinkPayload"]>(
        async () => ({ appUser: await services.linkAccount(context.getActor(), input) }),
        ["NOT_FOUND", "CONFLICT"],
      ),
  };
}
