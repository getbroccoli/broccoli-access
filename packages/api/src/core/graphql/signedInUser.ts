import { OPERATIONS, type SecurityContext } from "../security";
import type { ResolversTypes } from "./resolvers.gen";

/** The caller's `User` object, as `me` and each payload carrying the user return it; null without a user. */
export function signedInUserOf(security: SecurityContext | null): ResolversTypes["User"] | null {
  const user = security?.user;
  return user
    ? {
        id: user.userId,
        email: user.email,
        isOwner: user.isOwner,
        operations: OPERATIONS.filter((operation) => security.can(operation)),
      }
    : null;
}
