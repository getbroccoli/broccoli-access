import type { AppsPageQuery } from "@/__generated__/graphql";

/** An app as the app table shows it. */
export type AppRow = AppsPageQuery["apps"]["edges"][number]["node"];
