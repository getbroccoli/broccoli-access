import { Router, type RequestHandler } from "express";

import type { SeedPerson } from "../seed";
import { adminAccess } from "./adminAccess";
import type { FakeGoogleContext } from "./context";
import { sendGoogleError } from "./googleErrors";
import { pageOf, parsePageRequest } from "./pageRequest";
import { findPerson, fullName, type GoogleState } from "./state";

/** Google's Directory API v1: the customer, its users and each user's app grants. */
export function directoryRoutes(context: FakeGoogleContext): Router {
  const base = "/admin/directory/v1";
  return Router()
    .get(
      `${base}/customers/:customerKey`,
      adminAccess(context, "directory.customers.get"),
      showCustomer(context),
    )
    .get(`${base}/users`, adminAccess(context, "directory.users.list"), listUsers(context))
    .get(
      `${base}/users/:userKey/tokens`,
      adminAccess(context, "directory.tokens.list"),
      listTokens(context),
    );
}

function showCustomer(context: FakeGoogleContext): RequestHandler<{ customerKey: string }> {
  return (request, response) => {
    const { customer } = context.state;
    if (!isAcme(context.state, request.params.customerKey)) {
      return sendGoogleError(response, "badRequest");
    }
    response.json({
      kind: "admin#directory#customer",
      id: customer.id,
      customerDomain: customer.domain,
      postalAddress: { organizationName: customer.organizationName },
      customerCreationTime: customer.creationTime,
    });
  };
}

function listUsers(context: FakeGoogleContext): RequestHandler {
  return (request, response) => {
    const customerKey = typeof request.query.customer === "string" ? request.query.customer : "";
    if (!isAcme(context.state, customerKey)) return sendGoogleError(response, "badRequest");
    const pageRequest = parsePageRequest(
      request.query,
      "directory.users.list",
      context.maxPageSize,
    );
    if (pageRequest === undefined) return sendGoogleError(response, "invalid");
    const people = context.state.people.toSorted((a, b) => (a.email < b.email ? -1 : 1));
    const { items, nextPageToken } = pageOf(people, pageRequest);
    response.json({
      kind: "admin#directory#users",
      ...(items.length > 0 && {
        users: items.map((person) => directoryUser(context.state, person)),
      }),
      ...(nextPageToken !== undefined && { nextPageToken }),
    });
  };
}

function listTokens(context: FakeGoogleContext): RequestHandler<{ userKey: string }> {
  return (request, response) => {
    const person = findPerson(context.state, request.params.userKey);
    if (person === undefined) return sendGoogleError(response, "notFound");
    const tokens = context.state.grants
      .filter((grant) => grant.email === person.email)
      .map((grant) => ({
        kind: "admin#directory#token",
        clientId: grant.clientId,
        displayText: grant.appName,
        scopes: grant.scopes,
        userKey: person.id,
        anonymous: false,
        nativeApp: false,
      }));
    response.json({
      kind: "admin#directory#tokenList",
      ...(tokens.length > 0 && { items: tokens }),
    });
  };
}

/** `my_customer` names the caller's own customer, as in Google. */
function isAcme(state: GoogleState, customerKey: string): boolean {
  return customerKey === "my_customer" || customerKey === state.customer.id;
}

function directoryUser(state: GoogleState, person: SeedPerson) {
  return {
    kind: "admin#directory#user",
    id: person.id,
    primaryEmail: person.email,
    name: {
      givenName: person.givenName,
      familyName: person.familyName,
      fullName: fullName(person),
    },
    isAdmin: person.isSuperAdmin,
    suspended: person.suspended,
    orgUnitPath: "/",
    ...(person.managerEmail !== null && {
      relations: [{ value: person.managerEmail, type: "manager" }],
    }),
    customerId: state.customer.id,
    creationTime: person.creationTime,
  };
}
