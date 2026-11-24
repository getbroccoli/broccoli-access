import type { ApolloCache } from "@apollo/client";
import { evictRecord } from "@/apollo";

/** A linked account leaves every cached page of accounts without a person. */
export function removeLinkedAccount(cache: ApolloCache, id: string): void {
  evictRecord(cache, "AccountWithoutPerson", id);
}
