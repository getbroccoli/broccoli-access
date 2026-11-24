CREATE TABLE "app_invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"connection_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invited_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "app_invitations_connection_email_unique" UNIQUE("connection_id","email")
);
--> statement-breakpoint
ALTER TABLE "app_invitations" ADD CONSTRAINT "app_invitations_connection_id_app_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."app_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_invitations" ADD CONSTRAINT "app_invitations_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;