ALTER TABLE "account_changes" DROP CONSTRAINT "account_changes_action";--> statement-breakpoint
ALTER TABLE "account_changes" ALTER COLUMN "source_key" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_changes_one_running_invite" ON "account_changes" USING btree ("connection_id","email") WHERE "account_changes"."status" = 'running' and "account_changes"."action" = 'invite';--> statement-breakpoint
ALTER TABLE "account_changes" ADD CONSTRAINT "account_changes_action" CHECK ("account_changes"."action" in ('suspend', 'reactivate', 'invite'));