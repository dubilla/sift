import { auth } from "@/auth";
import { db } from "@/db";
import { emails, emailTags, tags, userStats } from "@/db/schema";
import { getUnarchivedEmails } from "@/lib/services/gmail";
import { classifyEmail, CONFIDENCE_THRESHOLD } from "@/lib/services/classifier";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";
import { classifyEmailsBatch } from "@/lib/services/classify-batch";
import { waitUntil } from "@vercel/functions";
import { eq, and, isNull, count, sql } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = await getValidAccessToken(session.user.id);

    const statsResult = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, session.user.id));

    const lastSyncedAt = statsResult[0]?.lastSyncedAt;

    const body = await request.json().catch(() => ({}));
    const { pageToken } = body;

    const result = await getUnarchivedEmails(accessToken, 100, pageToken, lastSyncedAt || undefined);

    const emailRecords = result.emails.map((email) => ({
      id: crypto.randomUUID(),
      externalId: email.id,
      userId: session.user.id,
      threadId: email.threadId,
      subject: email.subject,
      from: email.from,
      to: email.to,
      snippet: email.snippet,
      date: email.date,
      archivedAt: null,
      deletedAt: null,
      hasUnsubscribe: email.hasUnsubscribe || false,
      unsubscribeUrl: email.unsubscribeUrl || null,
      // Smart tagging metadata
      listId: email.listId,
      isNoreply: email.isNoreply,
      recipientCount: email.recipientCount,
    }));

    let insertedIds: string[] = [];
    if (emailRecords.length > 0) {
      const inserted = await db
        .insert(emails)
        .values(emailRecords)
        .onConflictDoNothing({ target: emails.externalId })
        .returning({ id: emails.id });
      insertedIds = inserted.map((r) => r.id);
    }

    if (insertedIds.length > 0) {
      waitUntil(
        classifyEmailsBatch(session.user.id, insertedIds).catch((err) => {
          console.error("Background classification failed:", err);
        })
      );
    }

    // Auto-classify newly synced emails
    let classifiedCount = 0;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_API_KEY && emailRecords.length > 0) {
      const allTags = await db.select().from(tags);
      const tagsByName = new Map(allTags.map((t) => [t.name, t]));

      for (const record of emailRecords) {
        try {
          const classification = await classifyEmail(
            {
              id: record.id,
              subject: record.subject || null,
              from: record.from,
              to: record.to || null,
              snippet: record.snippet || null,
              hasUnsubscribe: record.hasUnsubscribe,
              listId: record.listId,
              isNoreply: record.isNoreply,
              recipientCount: record.recipientCount,
            },
            OPENAI_API_KEY,
            session.user.id
          );

          if (classification.tag && classification.confidence >= CONFIDENCE_THRESHOLD) {
            const tag = tagsByName.get(classification.tag);
            if (tag) {
              await db
                .insert(emailTags)
                .values({
                  id: crypto.randomUUID(),
                  emailId: record.id,
                  tagId: tag.id,
                  source: classification.source,
                  confidence: classification.confidence,
                })
                .onConflictDoNothing();
              classifiedCount++;
            }
          }
        } catch {
          // Skip classification errors - email is still synced
        }
      }
    }

    // Get current count of unarchived emails in DB
    const dbCountResult = await db
      .select({ count: count() })
      .from(emails)
      .where(
        and(
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    const currentDbCount = dbCountResult[0]?.count || 0;

    const totalCount = statsResult[0]?.totalUnarchivedCount || 0;
    const isComplete = !result.nextPageToken;

    if (isComplete && emailRecords.length > 0) {
      await db
        .update(userStats)
        .set({ lastSyncedAt: new Date() })
        .where(eq(userStats.userId, session.user.id));
    }

    return NextResponse.json({
      synced: emailRecords.length,
      classified: classifiedCount,
      nextPageToken: result.nextPageToken,
      currentCount: currentDbCount,
      totalCount,
      isComplete,
    });
  } catch (error) {
    console.error("Error in /api/emails/sync/background:", error);

    const errorMessage = error instanceof Error ? error.message : "Failed to sync emails";
    const isAuthError = errorMessage.includes("refresh") || errorMessage.includes("authenticate");

    return NextResponse.json(
      { error: errorMessage },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
