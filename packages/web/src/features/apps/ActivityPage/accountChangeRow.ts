import type { ActivityPageQuery } from "@/__generated__/graphql";
import { GOOGLE_WORKSPACE } from "@/lib/useGoogleUserWrites";

/** A row of Activity: one account change with its person, app and requester. */
export type AccountChangeRow = ActivityPageQuery["accountChanges"]["edges"][number]["node"];

export function createsDirectoryAccount({
  action,
  app,
}: Pick<AccountChangeRow, "action" | "app">): boolean {
  return action === "INVITE" && app.catalogKey === GOOGLE_WORKSPACE;
}
