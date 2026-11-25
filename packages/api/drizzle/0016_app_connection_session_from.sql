ALTER TABLE "app_connections" ADD COLUMN "session_from" text;--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_session_from" CHECK ("app_connections"."session_from" in ('extension', 'server_sign_in'));--> statement-breakpoint
-- Until now only the extension made an app session, and exactly a connector with one has a notice.
UPDATE "app_connections" SET "session_from" = 'extension' WHERE "notice_accepted_at" IS NOT NULL;
