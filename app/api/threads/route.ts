import { auth } from "@/auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get pagination params from query string
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = (page - 1) * limit;

    // Query to get threads with latest message metadata and message count
    // Using FIRST_VALUE window function would be better, but keeping subqueries for compatibility
    const threads = await db
      .select({
        threadId: emails.threadId,
        subject: sql<string>`(
          SELECT e2.subject
          FROM emails e2
          WHERE e2.thread_id = emails.thread_id
            AND e2.user_id = emails.user_id
            AND e2.archived_at IS NULL
            AND e2.deleted_at IS NULL
          ORDER BY e2.date DESC
          LIMIT 1
        )`,
        from: sql<string>`(
          SELECT e2."from"
          FROM emails e2
          WHERE e2.thread_id = emails.thread_id
            AND e2.user_id = emails.user_id
            AND e2.archived_at IS NULL
            AND e2.deleted_at IS NULL
          ORDER BY e2.date DESC
          LIMIT 1
        )`,
        snippet: sql<string>`(
          SELECT e2.snippet
          FROM emails e2
          WHERE e2.thread_id = emails.thread_id
            AND e2.user_id = emails.user_id
            AND e2.archived_at IS NULL
            AND e2.deleted_at IS NULL
          ORDER BY e2.date DESC
          LIMIT 1
        )`,
        hasUnsubscribe: sql<boolean>`(
          SELECT e2.has_unsubscribe
          FROM emails e2
          WHERE e2.thread_id = emails.thread_id
            AND e2.user_id = emails.user_id
            AND e2.archived_at IS NULL
            AND e2.deleted_at IS NULL
          ORDER BY e2.date DESC
          LIMIT 1
        )`,
        unsubscribeUrl: sql<string | null>`(
          SELECT e2.unsubscribe_url
          FROM emails e2
          WHERE e2.thread_id = emails.thread_id
            AND e2.user_id = emails.user_id
            AND e2.archived_at IS NULL
            AND e2.deleted_at IS NULL
          ORDER BY e2.date DESC
          LIMIT 1
        )`,
        latestEmailId: sql<string>`(
          SELECT e2.id
          FROM emails e2
          WHERE e2.thread_id = emails.thread_id
            AND e2.user_id = emails.user_id
            AND e2.archived_at IS NULL
            AND e2.deleted_at IS NULL
          ORDER BY e2.date DESC
          LIMIT 1
        )`,
        date: sql<Date>`MAX(${emails.date})`,
        messageCount: sql<number>`COUNT(*)`,
      })
      .from(emails)
      .where(
        and(
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      )
      .groupBy(emails.threadId, emails.userId)
      .orderBy(desc(sql`MAX(${emails.date})`))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ threads, page, limit, hasMore: threads.length === limit });
  } catch (error) {
    console.error("Error in /api/threads:", error);
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 }
    );
  }
}
