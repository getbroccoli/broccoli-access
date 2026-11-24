ALTER TABLE "app_accounts" ADD COLUMN "employee_linked_by" text;--> statement-breakpoint
ALTER TABLE "app_accounts" ADD COLUMN "kind" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_accounts" ADD COLUMN "note" text;--> statement-breakpoint
UPDATE "app_accounts" SET "employee_linked_by" = 'email' WHERE "employee_id" IS NOT NULL;--> statement-breakpoint
-- The employee foreign key clears employee_id when the employee is deleted.
CREATE FUNCTION clear_app_account_employee_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.employee_linked_by := NULL;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER clear_app_account_employee_link BEFORE UPDATE OF employee_id ON app_accounts
FOR EACH ROW WHEN (OLD.employee_id IS NOT NULL AND NEW.employee_id IS NULL)
EXECUTE FUNCTION clear_app_account_employee_link();--> statement-breakpoint
ALTER TABLE "app_accounts" ADD CONSTRAINT "app_accounts_kind" CHECK ("app_accounts"."kind" in ('personal', 'service', 'external')),
  ADD CONSTRAINT "app_accounts_employee_link" CHECK (("app_accounts"."employee_id" is null) = ("app_accounts"."employee_linked_by" is null)
      and ("app_accounts"."employee_linked_by" is null or ("app_accounts"."kind" = 'personal' and "app_accounts"."employee_linked_by" in ('email','owner')))),
  ADD CONSTRAINT "app_accounts_note" CHECK ("app_accounts"."kind" <> 'personal' or "app_accounts"."note" is null);--> statement-breakpoint
CREATE INDEX "app_accounts_without_person" ON "app_accounts" USING btree ("email","id") WHERE "app_accounts"."employee_id" is null and "app_accounts"."kind" = 'personal';--> statement-breakpoint
CREATE INDEX "app_accounts_owner_link" ON "app_accounts" USING btree ("employee_id","app_id") WHERE "app_accounts"."employee_linked_by" = 'owner';