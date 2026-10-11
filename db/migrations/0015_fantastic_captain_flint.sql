CREATE INDEX "idx_emails_user_thread_date" ON "emails" USING btree ("user_id","thread_id","date");
