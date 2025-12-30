CREATE TABLE "classification_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email_id" text NOT NULL,
	"old_tag_id" text,
	"new_tag_id" text NOT NULL,
	"old_source" text,
	"old_confidence" real,
	"corrected_at" timestamp DEFAULT now() NOT NULL,
	"applied_to_similar" boolean DEFAULT false,
	"correction_context" jsonb,
	CONSTRAINT "idx_corrections_unique" UNIQUE("email_id","new_tag_id")
);
--> statement-breakpoint
ALTER TABLE "classification_corrections" ADD CONSTRAINT "classification_corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_corrections" ADD CONSTRAINT "classification_corrections_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_corrections" ADD CONSTRAINT "classification_corrections_old_tag_id_tags_id_fk" FOREIGN KEY ("old_tag_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_corrections" ADD CONSTRAINT "classification_corrections_new_tag_id_tags_id_fk" FOREIGN KEY ("new_tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_corrections_user" ON "classification_corrections" USING btree ("user_id","corrected_at");--> statement-breakpoint
CREATE INDEX "idx_corrections_email" ON "classification_corrections" USING btree ("email_id");