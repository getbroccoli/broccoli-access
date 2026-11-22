CREATE TABLE "app_connections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"connector" text NOT NULL,
	"app_id" uuid NOT NULL,
	"settings" jsonb NOT NULL,
	"encrypted_secrets" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_connections_connector_unique" UNIQUE("connector")
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"catalog_key" text,
	"external_ids" text[] DEFAULT '{}' NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_catalog_key_unique" UNIQUE("catalog_key"),
	CONSTRAINT "apps_status" CHECK ("apps"."status" in ('discovered', 'approved', 'ignored'))
);
--> statement-breakpoint
ALTER TABLE "instance" DROP CONSTRAINT "instance_setup_step";--> statement-breakpoint
ALTER TABLE "instance" ALTER COLUMN "setup_step" SET DEFAULT 'connect_google';--> statement-breakpoint
-- An instance still at the owner step has no owner yet, so it starts again at connecting Google.
UPDATE "instance" SET "setup_step" = 'connect_google' WHERE "setup_step" = 'owner';--> statement-breakpoint
ALTER TABLE "app_connections" ADD CONSTRAINT "app_connections_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance" ADD CONSTRAINT "instance_setup_step" CHECK ("instance"."setup_step" in ('connect_google', 'scan', 'select_apps', 'done'));