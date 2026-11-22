CREATE TABLE "extension_pairings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"browser" text NOT NULL,
	"paired_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "extension_pairings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "extension_pairings" ADD CONSTRAINT "extension_pairings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;