import type { Orm, Tx } from "../../../core/db";

/** What account changes need from the Google module: which accounts are the integration user's. */
export interface IntegrationUser {
  /** The email its app accounts carry; null before it exists or a directory scan has read it. */
  findIntegrationAccountEmail(db: Orm | Tx): Promise<string | null>;
}
