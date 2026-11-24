CREATE TABLE "integration_user" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"email" text NOT NULL,
	"google_user_id" text NOT NULL,
	"encrypted_secrets" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "integration_user_singleton" CHECK ("integration_user"."id")
);
--> statement-breakpoint
ALTER TABLE "integration_user" ADD CONSTRAINT "integration_user_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;