import {
  pgTable,
  text,
  timestamp,
  varchar,
  integer,
  boolean,
  primaryKey,
  real,
  unique,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// NextAuth tables
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => ({
    compositePk: primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  })
);

export const userStats = pgTable("user_stats", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  totalUnarchived: integer("total_unarchived").default(0).notNull(),
  totalUnarchivedCount: integer("total_unarchived_count").default(0).notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  lastInboxZero: timestamp("last_inbox_zero"),
  inboxZeroStreak: integer("inbox_zero_streak").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const emails = pgTable(
  "emails",
  {
    id: text("id").primaryKey(), // Will become internal UUID in Step 5
    externalId: text("external_id").notNull().unique(), // Gmail message ID
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    threadId: text("thread_id"),
    subject: text("subject"),
    from: varchar("from", { length: 500 }).notNull(),
    to: text("to"),
    snippet: text("snippet"),
    date: timestamp("date").notNull(),
    archivedAt: timestamp("archived_at"),
    deletedAt: timestamp("deleted_at"),
    hasUnsubscribe: boolean("has_unsubscribe").default(false),
    unsubscribeUrl: text("unsubscribe_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Smart tagging metadata
    listId: text("list_id"), // List-Id header for mailing list detection
    isNoreply: boolean("is_noreply").default(false), // Sender is noreply/donotreply
    recipientCount: integer("recipient_count").default(1), // Number of recipients
  },
  (table) => ({
    // Composite index for review classifications query
    // Optimizes: WHERE userId = X AND archivedAt IS NULL AND deletedAt IS NULL ORDER BY date DESC
    reviewClassificationsIdx: index("idx_emails_review_classifications").on(
      table.userId,
      table.archivedAt,
      table.deletedAt,
      table.date
    ),
  })
);

export const activityLog = pgTable("activity_log", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(), // 'archive', 'delete', 'unsubscribe'
  emailId: text("email_id").references(() => emails.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Asana integration tables
export const asanaSettings = pgTable("asana_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  asanaUserGid: text("asana_user_gid"), // Asana user GID for task assignment
  defaultWorkspaceGid: text("default_workspace_gid"),
  defaultWorkspaceName: text("default_workspace_name"),
  defaultProjectGid: text("default_project_gid"),
  defaultProjectName: text("default_project_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const asanaTasks = pgTable("asana_tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  emailId: text("email_id").references(() => emails.id),
  asanaTaskGid: text("asana_task_gid").notNull(),
  asanaTaskUrl: text("asana_task_url"),
  taskName: text("task_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User preferences
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  taskManager: varchar("task_manager", { length: 20 }).default("asana").notNull(), // 'asana' | 'todoist'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Todoist integration tables
export const todoistSettings = pgTable("todoist_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultProjectId: text("default_project_id"),
  defaultProjectName: text("default_project_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const todoistTasks = pgTable("todoist_tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  emailId: text("email_id").references(() => emails.id),
  todoistTaskId: text("todoist_task_id").notNull(),
  todoistTaskUrl: text("todoist_task_url"),
  taskName: text("task_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Smart tagging tables
export const tags = pgTable(
  "tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull().unique(), // 'archivable', 'quick_action', 'asana_task', 'unsubscribable'
    displayName: text("display_name").notNull(), // 'Archive', 'Quick Action', etc.
    description: text("description"), // Help text for the tag
    color: text("color"), // Tailwind color class or hex
    icon: text("icon"), // Emoji or icon identifier
    sortOrder: integer("sort_order").default(0), // For consistent UI ordering
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Index for filtering by tag name in review classifications
    nameIdx: index("idx_tags_name").on(table.name),
  })
);

export const emailTags = pgTable(
  "email_tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // 'rule' | 'llm' | 'user'
    confidence: real("confidence"), // 0-1, null for user-applied tags
    classifiedAt: timestamp("classified_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueEmailTag: unique().on(table.emailId, table.tagId),
    // Index for joining emails to emailTags
    emailIdIdx: index("idx_email_tags_email_id").on(table.emailId),
    // Index for joining tags to emailTags
    tagIdIdx: index("idx_email_tags_tag_id").on(table.tagId),
    // Index for confidence filtering (e.g., "needs review" 0.7-0.8 range)
    confidenceIdx: index("idx_email_tags_confidence").on(table.confidence),
  })
);

// Classification corrections - track user corrections for pattern learning
export const classificationCorrections = pgTable(
  "classification_corrections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    oldTagId: text("old_tag_id").references(() => tags.id, { onDelete: "set null" }),
    newTagId: text("new_tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    oldSource: text("old_source"), // 'rule' | 'llm' | 'pattern' | null
    oldConfidence: real("old_confidence"), // Previous confidence score
    correctedAt: timestamp("corrected_at").defaultNow().notNull(),
    appliedToSimilar: boolean("applied_to_similar").default(false),
    correctionContext: jsonb("correction_context"), // Email metadata snapshot
  },
  (table) => ({
    userIdx: index("idx_corrections_user").on(table.userId, table.correctedAt),
    emailIdx: index("idx_corrections_email").on(table.emailId),
    uniqueCorrection: unique("idx_corrections_unique").on(table.emailId, table.newTagId),
  })
);
