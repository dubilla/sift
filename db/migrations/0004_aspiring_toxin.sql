CREATE TABLE "asana_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"default_workspace_gid" text,
	"default_workspace_name" text,
	"default_project_gid" text,
	"default_project_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asana_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email_id" text,
	"asana_task_gid" text NOT NULL,
	"asana_task_url" text,
	"task_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asana_settings" ADD CONSTRAINT "asana_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asana_tasks" ADD CONSTRAINT "asana_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asana_tasks" ADD CONSTRAINT "asana_tasks_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE no action ON UPDATE no action;