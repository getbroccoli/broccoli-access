import type { ActivityPageQuery } from "@/__generated__/graphql";

/** A row of Activity: one account change with its person, app and requester. */
export type AccountChangeRow = ActivityPageQuery["accountChanges"]["edges"][number]["node"];
