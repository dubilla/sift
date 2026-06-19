CREATE TABLE "mobile_auth_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mobile_auth_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "mobile_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"device_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "mobile_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "mobile_auth_codes" ADD CONSTRAINT "mobile_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_mobile_auth_codes_code_hash" ON "mobile_auth_codes" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX "idx_mobile_auth_codes_user_id" ON "mobile_auth_codes" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "idx_mobile_sessions_token_hash" ON "mobile_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "idx_mobile_sessions_user_id" ON "mobile_sessions" USING btree ("user_id");
