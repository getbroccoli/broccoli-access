import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";

import type { Auth } from "../../auth";
import type { Orm } from "../../db";
import { isCrossOrigin } from "../helpers";
import {
  type EmployeeDirectory,
  PrincipalSecurityContext,
  profilesOf,
  type RequestSecurity,
  type SecurityContext,
} from "../../security";
import { createSetupSessionService, createInstanceService } from "../app";
import { readSetupToken } from "./setupCookie";

const setupSessions = createSetupSessionService();
const instances = createInstanceService();

/**
 * The signed-in user of a request, or the browser holding setup. Reading the session also
 * extends one that is due for renewal; the GraphQL adapter sends `renewedCookies` back, or the browser's
 * cookie would expire before the session does.
 */
export async function resolveSecurityContext(
  auth: Auth,
  orm: Orm,
  directory: EmployeeDirectory,
  requestHeaders: IncomingHttpHeaders,
): Promise<RequestSecurity> {
  // A page on another origin gets no authority from the browser's cookies, nor does a request
  // carrying a bearer token.
  if (
    isCrossOrigin(requestHeaders, auth.options.baseURL) ||
    requestHeaders.authorization !== undefined
  ) {
    return { security: null, renewedCookies: [] };
  }
  // Better Auth answers a request without a session cookie without a query.
  const { headers, response: session } = await auth.api.getSession({
    headers: fromNodeHeaders(requestHeaders),
    returnHeaders: true,
  });
  const renewedCookies = headers.getSetCookie();
  if (!session) {
    return { security: await resolveSetupHolder(orm, requestHeaders), renewedCookies };
  }
  return { security: await resolveUserSecurity(orm, directory, session.user), renewedCookies };
}

/** The security context of a signed-in user, read afresh: their profiles, owner flag and employee. */
async function resolveUserSecurity(
  orm: Orm,
  directory: EmployeeDirectory,
  { id: userId, email }: { id: string; email: string },
): Promise<SecurityContext> {
  const isOwner = userId === (await instances.readInstance(orm)).ownerUserId;
  const user = {
    userId,
    email,
    isOwner,
    permissionProfiles: profilesOf(isOwner),
    employeeId: await directory.employeeIdOfUser(userId),
  };
  return PrincipalSecurityContext.user(user, directory);
}

/** The setup holder, for a request carrying the live setup token; otherwise null. */
async function resolveSetupHolder(
  orm: Orm,
  requestHeaders: IncomingHttpHeaders,
): Promise<SecurityContext | null> {
  const token = readSetupToken(requestHeaders.cookie);
  if (!token || (await setupSessions.readSetupHolder(orm, { token, now: new Date() })) !== "you") {
    return null;
  }
  return PrincipalSecurityContext.setupHolder();
}
