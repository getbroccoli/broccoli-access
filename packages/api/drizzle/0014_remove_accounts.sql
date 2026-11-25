ALTER TABLE "account_changes" DROP CONSTRAINT "account_changes_action";--> statement-breakpoint
CREATE INDEX "import_records_source_email" ON "import_records" USING btree ("source_id",("values" ->> 'email'));--> statement-breakpoint
ALTER TABLE "account_changes" ADD CONSTRAINT "account_changes_action" CHECK ("account_changes"."action" in ('suspend', 'reactivate', 'invite', 'remove'));