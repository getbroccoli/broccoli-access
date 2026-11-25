ALTER TABLE "account_changes" ADD COLUMN "started_from" text DEFAULT 'account' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_changes" ADD COLUMN "employee_id" uuid;--> statement-breakpoint
CREATE INDEX "account_changes_offboarded_employee" ON "account_changes" USING btree ("employee_id","requested_at") WHERE "account_changes"."started_from" = 'offboarding';--> statement-breakpoint
ALTER TABLE "account_changes" ADD CONSTRAINT "account_changes_started_from" CHECK ("account_changes"."started_from" in ('account', 'offboarding'));--> statement-breakpoint
-- Written by hand: employees are another module's table. The change outlives its person.
ALTER TABLE "account_changes" ADD CONSTRAINT "account_changes_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
