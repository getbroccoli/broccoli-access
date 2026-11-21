import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { adminAccess, pageOf, parsePageRequest } from "./adminAccess";
import type { FakeGoogleContext } from "./context";
import { sendGoogleError } from "./googleErrors";
import { isInsideGrantLog, type GoogleState, type GrantEvent } from "./state";

/** Google's Reports API v1, limited to the `token` application's grant log. */
export function grantEventRoutes(context: FakeGoogleContext): Router {
  return Router().get(
    "/admin/reports/v1/activity/users/all/applications/token",
    adminAccess(context, "reports.activities.list"),
    listGrantEvents(context),
  );
}

const EVENT_FILTER = z.object({
  eventName: z.string().optional(),
  startTime: z.iso.datetime({ offset: true }).optional(),
  endTime: z.iso.datetime({ offset: true }).optional(),
});

function listGrantEvents(context: FakeGoogleContext): RequestHandler {
  return (request, response) => {
    const filter = EVENT_FILTER.safeParse(request.query);
    const pageRequest = parsePageRequest(request.query, "reports.activities.list");
    if (!filter.success || pageRequest === undefined) return sendGoogleError(response, "invalid");
    const { eventName, startTime, endTime } = filter.data;
    const now = context.now();
    // Every event the fake logs is an `authorize` event.
    const logged = eventName === undefined || eventName === "authorize" ? context.state.events : [];
    const events = logged
      .filter((event) => isInsideGrantLog(event.time, now))
      .filter((event) => startTime === undefined || event.time >= new Date(startTime))
      .filter((event) => endTime === undefined || event.time <= new Date(endTime))
      .toSorted((a, b) => b.time.getTime() - a.time.getTime());
    const { items, nextPageToken } = pageOf(events, pageRequest);
    response.json({
      kind: "admin#reports#activities",
      ...(items.length > 0 && { items: items.map((event) => activity(context.state, event)) }),
      ...(nextPageToken !== undefined && { nextPageToken }),
    });
  };
}

function activity(state: GoogleState, event: GrantEvent) {
  return {
    kind: "admin#reports#activity",
    id: {
      time: event.time.toISOString(),
      uniqueQualifier: event.uniqueQualifier,
      applicationName: "token",
      customerId: state.customer.id,
    },
    actor: { email: event.email, profileId: event.profileId },
    events: [
      {
        type: "auth",
        name: "authorize",
        parameters: [
          { name: "client_id", value: event.clientId },
          { name: "app_name", value: event.appName },
          { name: "client_type", value: "WEB" },
          { name: "scope", multiValue: event.scopes },
        ],
      },
    ],
  };
}
