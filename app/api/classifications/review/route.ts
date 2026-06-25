import { getCurrentSession } from "@/lib/mobile-auth";
import { db } from "@/db";
import { emails, emailTags, tags } from "@/db/schema";
import { NextResponse } from "next/server";
import { eq, and, isNull, gte, lte, desc, sql } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tagFilter = searchParams.get("tag"); // Filter by tag name
    const needsReview = searchParams.get("needsReview") === "true"; // Show only low confidence
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [
      eq(emails.userId, session.user.id),
      isNull(emails.archivedAt),
      isNull(emails.deletedAt),
    ];

    // Apply tag filter if specified
    if (tagFilter) {
      conditions.push(eq(tags.name, tagFilter));
    }

    // Apply confidence filter if "needs review" is selected
    if (needsReview) {
      conditions.push(gte(emailTags.confidence, 0.7));
      conditions.push(lte(emailTags.confidence, 0.8));
    }

    // Build query to fetch classified emails
    const query = db
      .select({
        id: emails.id,
        subject: emails.subject,
        from: emails.from,
        snippet: emails.snippet,
        date: emails.date,
        tagId: emailTags.tagId,
        tagName: tags.name,
        tagDisplayName: tags.displayName,
        tagIcon: tags.icon,
        tagColor: tags.color,
        confidence: emailTags.confidence,
        source: emailTags.source,
      })
      .from(emails)
      .innerJoin(emailTags, eq(emails.id, emailTags.emailId))
      .innerJoin(tags, eq(emailTags.tagId, tags.id))
      .where(and(...conditions));

    // Order by date descending and apply pagination
    const results = await query
      .orderBy(desc(emails.date))
      .limit(limit)
      .offset(offset);

    // Check if there are more results
    const hasMore = results.length === limit;

    // Transform results
    const emailsForReview = results.map((r) => ({
      id: r.id,
      subject: r.subject,
      from: r.from,
      snippet: r.snippet,
      date: r.date?.toISOString(),
      currentTag: {
        id: r.tagId,
        name: r.tagName,
        displayName: r.tagDisplayName,
        icon: r.tagIcon,
        color: r.tagColor,
      },
      confidence: r.confidence,
      source: r.source,
    }));

    return NextResponse.json({
      emails: emailsForReview,
      page,
      hasMore,
    });
  } catch (error) {
    console.error("Error fetching emails for review:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}
