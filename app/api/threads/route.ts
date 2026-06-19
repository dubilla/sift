import { db } from "@/db";
import { emails, emailTags, tags } from "@/db/schema";
import { getCurrentSession } from "@/lib/mobile-auth";
import { and, eq, isNull, desc, sql, notExists, inArray, max, count } from "drizzle-orm";
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
    const offset = (page - 1) * limit;
    const tagFilter = searchParams.get("tag"); // Filter by tag name

    // Build the base query conditions
    let whereCondition = and(
      eq(emails.userId, session.user.id),
      isNull(emails.archivedAt),
      isNull(emails.deletedAt)
    );

    // If filtering by tag, we need to get the email IDs that have that tag
    let taggedEmailIds: string[] | null = null;
    let unclassifiedFilter = false;

    if (tagFilter === "unclassified") {
      unclassifiedFilter = true;
    } else if (tagFilter) {
      // Find the tag
      const tag = await db
        .select()
        .from(tags)
        .where(eq(tags.name, tagFilter))
        .limit(1);

      if (tag.length === 0) {
        return NextResponse.json({ threads: [], page, limit, hasMore: false });
      }

      // Get email IDs with this tag (confidence >= 0.7)
      const taggedEmails = await db
        .select({ emailId: emailTags.emailId })
        .from(emailTags)
        .where(
          and(
            eq(emailTags.tagId, tag[0].id),
            sql`${emailTags.confidence} >= 0.7`
          )
        );

      taggedEmailIds = taggedEmails.map((e) => e.emailId);

      if (taggedEmailIds.length === 0) {
        return NextResponse.json({ threads: [], page, limit, hasMore: false });
      }
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
        // Get smart tag info for the latest email
        smartTag: sql<string | null>`(
          SELECT t.name
          FROM email_tags et
          JOIN tags t ON et.tag_id = t.id
          WHERE et.email_id = (
            SELECT e2.id
            FROM emails e2
            WHERE e2.thread_id = emails.thread_id
              AND e2.user_id = emails.user_id
              AND e2.archived_at IS NULL
              AND e2.deleted_at IS NULL
            ORDER BY e2.date DESC
            LIMIT 1
          )
          AND et.confidence >= 0.7
          LIMIT 1
        )`,
        smartTagIcon: sql<string | null>`(
          SELECT t.icon
          FROM email_tags et
          JOIN tags t ON et.tag_id = t.id
          WHERE et.email_id = (
            SELECT e2.id
            FROM emails e2
            WHERE e2.thread_id = emails.thread_id
              AND e2.user_id = emails.user_id
              AND e2.archived_at IS NULL
              AND e2.deleted_at IS NULL
            ORDER BY e2.date DESC
            LIMIT 1
          )
          AND et.confidence >= 0.7
          LIMIT 1
        )`,
        smartTagColor: sql<string | null>`(
          SELECT t.color
          FROM email_tags et
          JOIN tags t ON et.tag_id = t.id
          WHERE et.email_id = (
            SELECT e2.id
            FROM emails e2
            WHERE e2.thread_id = emails.thread_id
              AND e2.user_id = emails.user_id
              AND e2.archived_at IS NULL
              AND e2.deleted_at IS NULL
            ORDER BY e2.date DESC
            LIMIT 1
          )
          AND et.confidence >= 0.7
          LIMIT 1
        )`,
        date: max(emails.date),
        messageCount: count(),
      })
      .from(emails)
      .where(
        taggedEmailIds
          ? and(
              whereCondition,
              inArray(emails.id, taggedEmailIds)
            )
          : unclassifiedFilter
          ? and(
              whereCondition,
              notExists(
                db.select({ emailId: emailTags.emailId })
                  .from(emailTags)
                  .where(eq(emailTags.emailId, emails.id))
              )
            )
          : whereCondition
      )
      .groupBy(emails.threadId, emails.userId)
      .orderBy(desc(max(emails.date)))
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
