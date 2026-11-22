CREATE TABLE "account_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"app_account_id" uuid,
	"app_id" uuid NOT NULL,
	"email" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"action" text NOT NULL,
	"source_key" text NOT NULL,
	"status" text NOT NULL,
	"attempts" jsonb NOT NULL,
	"error" text,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "account_changes_action" CHECK ("account_changes"."action" in ('suspend', 'reactivate')),
	CONSTRAINT "account_changes_status" CHECK ("account_changes"."status" in ('running', 'succeeded', 'failed', 'done_by_hand')),
	CONSTRAINT "account_changes_error" CHECK ("account_changes"."error" in ('authentication_failed', 'permission_missing', 'rate_limited', 'app_unavailable', 'unexpected_response', 'blocked_by_check', 'account_not_found', 'wrong_workspace', 'not_allowed', 'owner_browser_lost')),
	CONSTRAINT "account_changes_error_when_failed" CHECK (("account_changes"."status" in ('failed', 'done_by_hand')) = ("account_changes"."error" is not null)),
	CONSTRAINT "account_changes_finished_when_not_running" CHECK (("account_changes"."status" = 'running') = ("account_changes"."finished_at" is null))
);
--> statement-breakpoint
ALTER TABLE "account_changes" ADD CONSTRAINT "account_changes_app_account_id_app_accounts_id_fk" FOREIGN KEY ("app_account_id") REFERENCES "public"."app_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_changes" ADD CONSTRAINT "account_changes_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_changes" ADD CONSTRAINT "account_changes_connection_id_app_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."app_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_changes" ADD CONSTRAINT "account_changes_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_changes_one_running" ON "account_changes" USING btree ("app_account_id") WHERE "account_changes"."status" = 'running';--> statement-breakpoint
CREATE INDEX "account_changes_app_account" ON "account_changes" USING btree ("app_account_id","requested_at");