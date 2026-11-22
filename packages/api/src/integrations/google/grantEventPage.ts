import { z } from "zod";

import { bearer, fetchRequired } from "./fetchGoogleJson";

export interface GoogleGrantEventPage {
  events: GoogleGrantEvent[];
  nextPageToken: string | null;
}

/** A user granting an app access, from the token log. */
export interface GoogleGrantEvent {
  userId: string;
  clientId: string;
  time: Date;
}

/** One page of the Reports API's `authorize` events logged since `startTime`, from a null page token. */
export async function readGrantEventPage(
  adminApiUrl: string,
  accessToken: string,
  { startTime, pageToken }: { startTime: Date; pageToken: string | null },
): Promise<GoogleGrantEventPage> {
  const url = new URL("admin/reports/v1/activity/users/all/applications/token", `${adminApiUrl}/`);
  url.search = new URLSearchParams({
    eventName: "authorize",
    startTime: startTime.toISOString(),
    maxResults: String(EVENTS_PER_PAGE),
    ...(pageToken !== null && { pageToken }),
  }).toString();
  const page = await fetchRequired(url, ACTIVITIES, bearer(accessToken));
  return {
    events: (page.items ?? []).flatMap(grantEvents),
    nextPageToken: page.nextPageToken ?? null,
  };
}

/** The Reports API's largest page. */
const EVENTS_PER_PAGE = 1000;

const ACTIVITIES = z.object({
  items: z
    .array(
      z.object({
        id: z.object({ time: z.iso.datetime({ offset: true }) }),
        actor: z.object({ profileId: z.string().optional() }),
        events: z.array(
          z.object({
            name: z.string(),
            parameters: z
              .array(z.object({ name: z.string(), value: z.string().optional() }))
              .optional(),
          }),
        ),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

type Activity = NonNullable<z.infer<typeof ACTIVITIES>["items"]>[number];

/** The activity's `authorize` events that name their user and client. */
function grantEvents({ id, actor, events }: Activity): GoogleGrantEvent[] {
  const userId = actor.profileId;
  if (userId === undefined) {
    return [];
  }
  return events.flatMap(({ name, parameters }) => {
    const clientId = parameters?.find((parameter) => parameter.name === "client_id")?.value;
    return name === "authorize" && clientId !== undefined
      ? [{ userId, clientId, time: new Date(id.time) }]
      : [];
  });
}
