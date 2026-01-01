CREATE INDEX "idx_email_tags_email_id" ON "email_tags" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "idx_email_tags_tag_id" ON "email_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_email_tags_confidence" ON "email_tags" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "idx_emails_review_classifications" ON "emails" USING btree ("user_id","archived_at","deleted_at","date");--> statement-breakpoint
CREATE INDEX "idx_tags_name" ON "tags" USING btree ("name");