import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../../auth";
import { MAIL_SOURCES, SETUP_STEPS } from "../domain";

/** The one row describing this installation; the migration inserts it. */
export const instance = pgTable(
  "instance",
  {
    id: boolean("id").primaryKey().default(true),
    ownerUserId: text("owner_user_id").references(() => user.id),
    setupStep: text("setup_step", { enum: SETUP_STEPS }).notNull().default("owner"),
    /** Before the owner exists: the hash of the setup holder's token. */
    setupTokenHash: text("setup_token_hash"),
    setupExpiresAt: timestamp("setup_expires_at", { withTimezone: true }),
    /** How the owner chose to send email; null until they choose. */
    mailSource: text("mail_source", { enum: MAIL_SOURCES }),
    mailFrom: text("mail_from"),
    /** The SMTP URL or Resend key of `mail_source`, encrypted. */
    encryptedMailSecret: text("encrypted_mail_secret"),
    /** Where links in emails point, saved with the choice since jobs have no request of their own. */
    mailLinkOrigin: text("mail_link_origin"),
  },
  (table) => [
    check("instance_singleton", sql`${table.id}`),
    check("instance_setup_step", sql`${table.setupStep} in ('owner', 'done')`),
    check(
      "instance_setup_session",
      sql`num_nonnulls(${table.setupTokenHash}, ${table.setupExpiresAt}) in (0, 2)`,
    ),
    check(
      "instance_mail_source",
      sql`${table.mailSource} in ('smtp_server', 'resend_api', 'no_email')`,
    ),
  ],
);
