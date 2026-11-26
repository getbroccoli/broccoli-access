import { createHash } from "node:crypto";

import { Router, type RequestHandler } from "express";

import { pageOf } from "../utils";
import { adminAccess } from "./adminAccess";
import type { FakeGoogleContext } from "./context";
import { sendGoogleError } from "./googleErrors";
import { parsePageRequest } from "./pageRequest";
import { type DirectoryPerson, findPerson, fullName, type GoogleState } from "./state";

/** Google's Directory API v1: the customer, its users, their photos and each user's app grants. */
export function directoryRoutes(context: FakeGoogleContext): Router {
  const base = "/admin/directory/v1";
  return Router()
    .get(
      `${base}/customers/:customerKey`,
      adminAccess(context, "directory.customers.get"),
      showCustomer(context),
    )
    .get(`${base}/users`, adminAccess(context, "directory.users.list"), listUsers(context))
    .get(`${base}/users/:userKey`, adminAccess(context, "directory.users.get"), showUser(context))
    .get(
      `${base}/users/:userKey/photos/thumbnail`,
      adminAccess(context, "directory.users.photos.get"),
      showPhoto(context),
    )
    .get(
      `${base}/users/:userKey/tokens`,
      adminAccess(context, "directory.tokens.list"),
      listTokens(context),
    );
}

function showUser(context: FakeGoogleContext): RequestHandler<{ userKey: string }> {
  return (request, response) => {
    const person = findPerson(context.state, request.params.userKey);
    if (person === undefined) return sendGoogleError(response, "notFound");
    response.json(directoryUser(context.state, person));
  };
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

function showPhoto(context: FakeGoogleContext): RequestHandler<{ userKey: string }> {
  return (request, response) => {
    const person = findPerson(context.state, request.params.userKey);
    if (!person?.photo) return sendGoogleError(response, "notFound");
    response.json({
      kind: "admin#directory#user#photo",
      id: person.id,
      etag: photoEtag(person.photo),
      primaryEmail: person.email,
      mimeType: "image/png",
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
      photoData: person.photo.toString("base64url"),
    });
  };
}

/** Google downsizes every photo to 96×96 pixels. */
const THUMBNAIL_SIZE = 96;

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

/** A person as Directory answers them, in `users.list` and after a write. */
export function directoryUser(state: GoogleState, person: DirectoryPerson) {
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
    changePasswordAtNextLogin: person.changePasswordAtNextLogin,
    orgUnitPath: "/",
    ...(person.managerEmail !== null && {
      relations: [{ value: person.managerEmail, type: "manager" }],
    }),
    customerId: state.customer.id,
    creationTime: person.creationTime,
    ...(person.externalIds && { externalIds: person.externalIds }),
    ...(person.photo && { thumbnailPhotoEtag: photoEtag(person.photo) }),
  };
}

/** Changes with the photo's bytes, as Google's etag changes with the photo. */
function photoEtag(photo: Buffer): string {
  return `"${createHash("sha256").update(photo).digest("base64url").slice(0, ETAG_LENGTH)}"`;
}

/** Long enough that two photos never share an etag. */
const ETAG_LENGTH = 16;
