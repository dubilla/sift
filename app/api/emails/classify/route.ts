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
    const { emailIds, limit = 50 } = body;

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
      // Find unclassified emails (no entry in email_tags)
      const classifiedEmailIds = await db
        .select({ emailId: emailTags.emailId })
        .from(emailTags);

      const classifiedIds = classifiedEmailIds.map((r) => r.emailId);

      emailsToClassify = await db
        .select()
        .from(emails)
        .where(
          and(
            eq(emails.userId, session.user.id),
            isNull(emails.archivedAt),
            isNull(emails.deletedAt),
            classifiedIds.length > 0
              ? // Exclude already classified emails
                // Note: drizzle doesn't have notInArray, so we use raw SQL workaround
                // For now, we'll filter in JS
                undefined
              : undefined
          )
        )
        .orderBy(desc(emails.date))
        .limit(limit * 2); // Fetch extra to filter

      // Filter out already classified
      if (classifiedIds.length > 0) {
        emailsToClassify = emailsToClassify.filter(
          (e) => !classifiedIds.includes(e.id)
        );
      }
      emailsToClassify = emailsToClassify.slice(0, limit);
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
        OPENAI_API_KEY
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
