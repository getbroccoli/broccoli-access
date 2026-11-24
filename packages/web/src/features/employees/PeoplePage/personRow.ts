import type { PeoplePageQuery } from "@/__generated__/graphql";

/** A row of the People table: a person with their status and apps. */
export type PersonRow = NonNullable<PeoplePageQuery["employees"]>["edges"][number]["node"];
