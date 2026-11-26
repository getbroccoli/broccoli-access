import express, { Router, type RequestHandler } from "express";
import { z } from "zod";

import { adminAccess } from "./adminAccess";
import type { FakeGoogleContext } from "./context";
import { directoryUser } from "./directory";
import { sendGoogleError } from "./googleErrors";
import { findPerson } from "./state";

/** Google's Directory API v1 user writes: creating a user, and suspending or restoring one. */
export function userWriteRoutes(context: FakeGoogleContext): Router {
  const users = "/admin/directory/v1/users";
  return Router()
    .post(
      users,
      adminAccess(context, "directory.users.insert"),
      express.json(),
      createUser(context),
    )
    .put(
      `${users}/:userKey`,
      adminAccess(context, "directory.users.update"),
      express.json(),
      updateUser(context),
    );
}

/** Google's bounds for a password. */
const PASSWORD_LENGTH = { min: 8, max: 100 };

const NEW_USER = z.object({
  primaryEmail: z.string().toLowerCase(),
  name: z.object({ givenName: z.string().min(1), familyName: z.string().min(1) }),
  password: z.string().min(PASSWORD_LENGTH.min).max(PASSWORD_LENGTH.max),
  changePasswordAtNextLogin: z.boolean().default(false),
  externalIds: z
    .array(z.object({ type: z.string(), customType: z.string().optional(), value: z.string() }))
    .optional(),
});

const USER_UPDATE = z.object({ suspended: z.boolean() });

/** The id Google's own example of a created user has; each later one counts up from it. */
const FIRST_CREATED_USER_ID = 118204455667788990011n;

function createUser(context: FakeGoogleContext): RequestHandler {
  return (request, response) => {
    const { state } = context;
    const body = NEW_USER.safeParse(request.body);
    if (!body.success || !isInDomain(body.data.primaryEmail, state.customer.domain)) {
      return sendGoogleError(response, "invalid");
    }
    const { primaryEmail, name, changePasswordAtNextLogin, externalIds } = body.data;
    if (findPerson(state, primaryEmail) !== undefined) {
      return sendGoogleError(response, "duplicate");
    }
    // The password is checked and dropped: nothing the fake serves needs it, so nothing can leak it.
    const person = {
      id: String(FIRST_CREATED_USER_ID + BigInt(state.createdUserCount)),
      email: primaryEmail,
      ...name,
      managerEmail: null,
      isSuperAdmin: false,
      suspended: false,
      creationTime: context.now().toISOString(),
      photo: null,
      changePasswordAtNextLogin,
      ...(externalIds && { externalIds }),
      createdSinceReset: true,
    };
    state.createdUserCount += 1;
    state.people.push(person);
    response.json(directoryUser(state, person));
  };
}

function updateUser(context: FakeGoogleContext): RequestHandler<{ userKey: string }> {
  return (request, response) => {
    const person = findPerson(context.state, request.params.userKey);
    if (person === undefined) return sendGoogleError(response, "notFound");
    const body = USER_UPDATE.safeParse(request.body);
    if (!body.success) return sendGoogleError(response, "invalid");
    person.suspended = body.data.suspended;
    response.json(directoryUser(context.state, person));
  };
}

function isInDomain(email: string, domain: string): boolean {
  const [localPart, emailDomain, ...rest] = email.split("@");
  return Boolean(localPart) && emailDomain === domain && rest.length === 0;
}
