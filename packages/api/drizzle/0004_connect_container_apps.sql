ALTER TABLE "import_sources" DROP CONSTRAINT "import_sources_failure";--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "status" text DEFAULT 'connected' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "reconnect_cause" text;--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "notice_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_connections" ADD COLUMN "notice_accepted_by" text;--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_notice_accepted_by_user_id_fk" FOREIGN KEY ("notice_accepted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_status" CHECK ("app_connections"."status" in ('connected', 'reconnect'));--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_reconnect_cause" CHECK ("app_connections"."reconnect_cause" in ('authentication_failed', 'permission_missing', 'wrong_workspace'));--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_reconnect_cause_when_reconnect" CHECK (("app_connections"."status" = 'reconnect') = ("app_connections"."reconnect_cause" is not null));--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_notice_accepted" CHECK (("app_connections"."notice_accepted_at" is null) = ("app_connections"."notice_accepted_by" is null));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_failure" CHECK ("import_sources"."failure" in ('authentication_failed', 'permission_missing', 'rate_limited', 'app_unavailable', 'unexpected_response', 'blocked_by_check', 'account_not_found', 'wrong_workspace', 'not_allowed', 'owner_browser_lost'));