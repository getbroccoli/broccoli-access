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
ALTER TABLE "employee_app_choices" ADD CONSTRAINT "employee_app_choices_employee_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "employee_app_choices" ADD CONSTRAINT "employee_app_choices_app_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade;
