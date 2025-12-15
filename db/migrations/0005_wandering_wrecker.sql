CREATE TABLE "email_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"source" text NOT NULL,
	"confidence" real,
	"classified_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_tags_email_id_tag_id_unique" UNIQUE("email_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"color" text,
	"icon" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "list_id" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "is_noreply" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "recipient_count" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "email_tags" ADD CONSTRAINT "email_tags_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tags" ADD CONSTRAINT "email_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;