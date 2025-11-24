import { auth } from "@/auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      .limit(100);

    return NextResponse.json({ threads });
  } catch (error) {
    console.error("Error in /api/threads:", error);
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 }
    );
  }
}
