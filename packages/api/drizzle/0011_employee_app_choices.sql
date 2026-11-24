CREATE TABLE "employee_app_choices" (
	"employee_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"choice" text NOT NULL,
	"role" text,
	CONSTRAINT "employee_app_choices_employee_id_app_id_pk" PRIMARY KEY("employee_id","app_id"),
	CONSTRAINT "employee_app_choices_choice" CHECK ("employee_app_choices"."choice" in ('to_review','added','removed','role_picked')),
	CONSTRAINT "employee_app_choices_role" CHECK ("employee_app_choices"."choice" in ('added','role_picked') or "employee_app_choices"."role" is null)
);
--> statement-breakpoint
CREATE INDEX "employee_app_choices_review_app" ON "employee_app_choices" USING btree ("app_id") WHERE "employee_app_choices"."choice" = 'to_review';--> statement-breakpoint
CREATE INDEX "app_accounts_employee_app" ON "app_accounts" USING btree ("employee_id","app_id");--> statement-breakpoint
CREATE INDEX "employee_templates_template_id_id" ON "employee_templates" USING btree ("template_id","id");--> statement-breakpoint
ALTER TABLE "employee_app_choices" ADD CONSTRAINT "employee_app_choices_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "employee_app_choices" ADD CONSTRAINT "employee_app_choices_app_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade;
