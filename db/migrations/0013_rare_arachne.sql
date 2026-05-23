CREATE TABLE "reader_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reader_settings" ADD CONSTRAINT "reader_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;