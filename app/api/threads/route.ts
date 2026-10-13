import { db } from "@/db";
import { getCurrentSession } from "@/lib/mobile-auth";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get pagination params from query string
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");
    // An explicit offset lets clients that removed rows locally (e.g. archived them)
    // resume from what they still hold instead of skipping past shifted rows.
    const offsetParam = parseInt(searchParams.get("offset") ?? "");
    const offset = Number.isInteger(offsetParam) && offsetParam >= 0 ? offsetParam : (page - 1) * limit;
    const tagFilter = searchParams.get("tag"); // Filter by tag name
    const userId = session.user.id;

    // Narrows which emails count toward a thread's date/messageCount and
    // whether the thread appears at all.
    const tagCondition =
      tagFilter === "unclassified"
        ? sql`AND NOT EXISTS (
            SELECT 1 FROM email_tags et
            WHERE et.email_id = e.id AND et.confidence >= 0.7
          )`
        : tagFilter
        ? sql`AND EXISTS (
            SELECT 1
            FROM email_tags et
            JOIN tags t ON t.id = et.tag_id
            WHERE et.email_id = e.id
              AND t.name = ${tagFilter}
              AND et.confidence >= 0.7
          )`
        : sql``;

    // Paginate over the cheap per-thread aggregate first, then look up the
    // latest email (and its smart tag) once per thread on this page only.
    const threads = await db.execute(sql`
      WITH page AS (
        SELECT
          e.thread_id,
          MAX(e.date) AS date,
          COUNT(*)::int AS message_count
        FROM emails e
        WHERE e.user_id = ${userId}
          AND e.thread_id IS NOT NULL
          AND e.archived_at IS NULL
          AND e.deleted_at IS NULL
          ${tagCondition}
        GROUP BY e.thread_id
        ORDER BY MAX(e.date) DESC, e.thread_id
        LIMIT ${limit}
        OFFSET ${offset}
      )
      SELECT
        page.thread_id AS "threadId",
        latest.subject,
        latest."from",
        latest.snippet,
        latest.has_unsubscribe AS "hasUnsubscribe",
        latest.unsubscribe_url AS "unsubscribeUrl",
        latest.id AS "latestEmailId",
        smart_tag.name AS "smartTag",
        smart_tag.icon AS "smartTagIcon",
        smart_tag.color AS "smartTagColor",
        -- Raw execute skips Drizzle's timestamp mapping; emit the same ISO string
        to_char(page.date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS date,
        page.message_count AS "messageCount"
      FROM page
      CROSS JOIN LATERAL (
        SELECT e2.id, e2.subject, e2."from", e2.snippet, e2.has_unsubscribe, e2.unsubscribe_url
        FROM emails e2
        WHERE e2.thread_id = page.thread_id
          AND e2.user_id = ${userId}
          AND e2.archived_at IS NULL
          AND e2.deleted_at IS NULL
        ORDER BY e2.date DESC
        LIMIT 1
      ) latest
      LEFT JOIN LATERAL (
        SELECT t.name, t.icon, t.color
        FROM email_tags et
        JOIN tags t ON t.id = et.tag_id
        WHERE et.email_id = latest.id
          AND et.confidence >= 0.7
        LIMIT 1
      ) smart_tag ON true
      ORDER BY page.date DESC, page.thread_id
    `);

    return NextResponse.json({ threads, page, limit, hasMore: threads.length === limit });
  } catch (error) {
    console.error("Error in /api/threads:", error);
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 }
    );
  }
}
