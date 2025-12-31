import { auth } from "@/auth";
import { db } from "@/db";
import { emails, emailTags, tags } from "@/db/schema";
import { classifyEmail, CONFIDENCE_THRESHOLD } from "@/lib/services/classifier";
import { NextResponse } from "next/server";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { emailIds, limit = 50, classifyAll = false } = body;

    // Get emails to classify
    let emailsToClassify;

    if (emailIds && Array.isArray(emailIds) && emailIds.length > 0) {
      // Classify specific emails
      emailsToClassify = await db
        .select()
        .from(emails)
        .where(
          and(
            eq(emails.userId, session.user.id),
            inArray(emails.id, emailIds)
          )
        )
        .limit(limit);
    } else {
      // Find unclassified emails (no entry in email_tags) for this user
      const classifiedEmailIds = await db
        .select({ emailId: emailTags.emailId })
        .from(emailTags)
        .innerJoin(emails, eq(emailTags.emailId, emails.id))
        .where(eq(emails.userId, session.user.id));

      const classifiedIds = new Set(classifiedEmailIds.map((r) => r.emailId));

      // Fetch emails based on whether we're classifying all or just a batch
      const fetchLimit = classifyAll ? 10000 : limit * 3; // If classifyAll, fetch up to 10k, else fetch extra for filtering

      emailsToClassify = await db
        .select()
        .from(emails)
        .where(
          and(
            eq(emails.userId, session.user.id),
            isNull(emails.archivedAt),
            isNull(emails.deletedAt)
          )
        )
        .orderBy(desc(emails.date))
        .limit(fetchLimit);

      // Filter out already classified (in JS since Drizzle doesn't have notInArray easily)
      emailsToClassify = emailsToClassify
        .filter((e) => !classifiedIds.has(e.id))
        .slice(0, classifyAll ? emailsToClassify.length : limit);
    }

    if (emailsToClassify.length === 0) {
      return NextResponse.json({
        classified: 0,
        results: [],
        message: "No emails to classify",
      });
    }

    // Fetch all tags for ID lookup
    const allTags = await db.select().from(tags);
    const tagsByName = new Map(allTags.map((t) => [t.name, t]));

    const results = [];

    // Classify each email
    for (const email of emailsToClassify) {
      const classification = await classifyEmail(
        {
          id: email.id,
          subject: email.subject,
          from: email.from,
          to: email.to,
          snippet: email.snippet,
          hasUnsubscribe: email.hasUnsubscribe || false,
          listId: email.listId,
          isNoreply: email.isNoreply || false,
          recipientCount: email.recipientCount || 1,
        },
        OPENAI_API_KEY,
        session.user.id // Pass userId for pattern matching
      );

      // Only store classifications that meet confidence threshold
      if (classification.tag && classification.confidence >= CONFIDENCE_THRESHOLD) {
        const tag = tagsByName.get(classification.tag);

        if (tag) {
          await db
            .insert(emailTags)
            .values({
              id: crypto.randomUUID(),
              emailId: email.id,
              tagId: tag.id,
              source: classification.source,
              confidence: classification.confidence,
            })
            .onConflictDoNothing();
        }
      }

      results.push({
        emailId: email.id,
        subject: email.subject,
        ...classification,
      });
    }

    return NextResponse.json({
      classified: results.filter((r) => r.tag !== null).length,
      total: emailsToClassify.length,
      classifiedAll: classifyAll,
      results,
    });
  } catch (error) {
    console.error("Error in /api/emails/classify:", error);
    return NextResponse.json(
      { error: "Failed to classify emails" },
      { status: 500 }
    );
  }
}

// GET: Get classification stats
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get tag counts for user's emails
    const allTags = await db.select().from(tags);

    const tagCounts: Record<string, number> = {};

    for (const tag of allTags) {
      const countResult = await db
        .select({ emailId: emailTags.emailId })
        .from(emailTags)
        .innerJoin(emails, eq(emailTags.emailId, emails.id))
        .where(
          and(
            eq(emails.userId, session.user.id),
            eq(emailTags.tagId, tag.id),
            isNull(emails.archivedAt),
            isNull(emails.deletedAt)
          )
        );

      tagCounts[tag.name] = countResult.length;
    }

    // Get total unclassified count
    const allEmailIds = await db
      .select({ id: emails.id })
      .from(emails)
      .where(
        and(
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    const classifiedEmailIds = await db
      .select({ emailId: emailTags.emailId })
      .from(emailTags)
      .innerJoin(emails, eq(emailTags.emailId, emails.id))
      .where(eq(emails.userId, session.user.id));

    const classifiedSet = new Set(classifiedEmailIds.map((r) => r.emailId));
    const unclassified = allEmailIds.filter((e) => !classifiedSet.has(e.id)).length;

    return NextResponse.json({
      tags: allTags.map((t) => ({
        id: t.id,
        name: t.name,
        displayName: t.displayName,
        color: t.color,
        icon: t.icon,
        count: tagCounts[t.name] || 0,
      })),
      unclassified,
      total: allEmailIds.length,
    });
  } catch (error) {
    console.error("Error in GET /api/emails/classify:", error);
    return NextResponse.json(
      { error: "Failed to get classification stats" },
      { status: 500 }
    );
  }
}
