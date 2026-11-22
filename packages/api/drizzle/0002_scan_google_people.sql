CREATE TABLE "app_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"app_id" uuid NOT NULL,
	"email" text NOT NULL,
	"employee_id" uuid,
	"status" text NOT NULL,
	"found_via" text[] NOT NULL,
	"granted_at" timestamp with time zone,
	"granted_before" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_accounts_app_email" UNIQUE("app_id","email"),
	CONSTRAINT "app_accounts_status" CHECK ("app_accounts"."status" in ('active', 'suspended'))
);
--> statement-breakpoint
-- No code wrote import sources before scans, so none holds the old kinds and statuses.
DELETE FROM "import_sources";--> statement-breakpoint
ALTER TABLE "import_sources" DROP CONSTRAINT "import_sources_kind";--> statement-breakpoint
ALTER TABLE "import_sources" DROP CONSTRAINT "import_sources_status";--> statement-breakpoint
ALTER TABLE "import_sources" DROP CONSTRAINT "import_sources_failure";--> statement-breakpoint
ALTER TABLE "import_sources" ALTER COLUMN "read_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "import_sources" ALTER COLUMN "read_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "import_sources" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
ALTER TABLE "import_sources" ADD COLUMN "connection_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "app_accounts" ADD CONSTRAINT "app_accounts_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- shortcut: deleting an employee clears these links without history; fine until the copied delete-employee action goes with the old People panel.
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_records" DROP COLUMN "external_record_id";--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_connection_unique" UNIQUE("connection_id");--> statement-breakpoint
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_type" CHECK ("import_records"."type" in ('app_account'));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_failure_when_failed" CHECK (("import_sources"."status" = 'scan_failed') = ("import_sources"."failure" is not null));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_kind" CHECK ("import_sources"."kind" in ('app_connection'));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_status" CHECK ("import_sources"."status" in ('scanning', 'scanned', 'scan_failed'));--> statement-breakpoint
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_failure" CHECK ("import_sources"."failure" in ('authentication_failed', 'permission_missing', 'rate_limited', 'app_unavailable', 'unexpected_response'));--> statement-breakpoint
-- Foreign keys between modules' tables, which the TypeScript schemas cannot import from each other.
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_connection_id_app_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."app_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- shortcut: deleting an employee clears these links without history; fine until the copied delete-employee action goes with the old People panel.
ALTER TABLE "app_accounts" ADD CONSTRAINT "app_accounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
