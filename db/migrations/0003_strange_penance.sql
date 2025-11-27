ALTER TABLE "emails" ALTER COLUMN "external_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_external_id_unique" UNIQUE("external_id");