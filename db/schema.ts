import {
  pgTable,
  text,
  timestamp,
  varchar,
  integer,
  boolean,
  primaryKey,
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
  lastSyncedAt: timestamp("last_synced_at"),
  lastInboxZero: timestamp("last_inbox_zero"),
  inboxZeroStreak: integer("inbox_zero_streak").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const emails = pgTable("emails", {
  id: text("id").primaryKey(), // Gmail message ID
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
});

export const activityLog = pgTable("activity_log", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(), // 'archive', 'delete', 'unsubscribe'
  emailId: text("email_id").references(() => emails.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
