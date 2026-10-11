import { withAuth } from "@/lib/api/with-auth";
import { db } from "@/db";
import { emails, userStats } from "@/db/schema";
import { getUnarchivedEmails } from "@/lib/services/gmail";
import { classifyEmailsBatch, classifyUntaggedBacklog } from "@/lib/services/classify-batch";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";
import { reauthErrorResponse } from "@/lib/api/token-error";
import { waitUntil } from "@vercel/functions";
import { eq, and, isNull, count } from "drizzle-orm";

export const POST = withAuth(async (request, user) => {
  try {
    const accessToken = await getValidAccessToken(user.id);

    const statsResult = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, user.id));

    const lastSyncedAt = statsResult[0]?.lastSyncedAt;

    const body = await request.json().catch(() => ({}));
    const { pageToken } = body;

    const result = await getUnarchivedEmails(accessToken, 100, pageToken, lastSyncedAt || undefined);

    const emailRecords = result.emails.map((email) => ({
      id: crypto.randomUUID(),
      externalId: email.id,
      userId: user.id,
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

    // Gmail's after: filter is day-granular, so most syncs re-fetch emails we
    // already have. Only rows actually inserted here have IDs in the DB, so only
    // those get classified (classifying the rest would tag phantom IDs).
    let insertedIds: string[] = [];
    if (emailRecords.length > 0) {
      const inserted = await db
        .insert(emails)
        .values(emailRecords)
        .onConflictDoNothing({ target: emails.externalId })
        .returning({ id: emails.id });
      insertedIds = inserted.map((r) => r.id);
    }

    const isComplete = !result.nextPageToken;

    // Classify after responding so a slow LLM batch can't time out the sync
    // and keep lastSyncedAt from advancing. New emails go first; once the sync
    // reaches its last page, also chip away at never-classified older emails.
    if (insertedIds.length > 0 || isComplete) {
      waitUntil(
        (async () => {
          await classifyEmailsBatch(user.id, insertedIds);
          if (isComplete) await classifyUntaggedBacklog(user.id);
        })().catch((err) => {
          console.error("Background sync classification failed:", err);
        })
      );
    }

    // Get current count of unarchived emails in DB
    const dbCountResult = await db
      .select({ count: count() })
      .from(emails)
      .where(
        and(
          eq(emails.userId, user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    const currentDbCount = dbCountResult[0]?.count || 0;

    const totalCount = statsResult[0]?.totalUnarchivedCount || 0;

    if (isComplete && emailRecords.length > 0) {
      await db
        .update(userStats)
        .set({ lastSyncedAt: new Date() })
        .where(eq(userStats.userId, user.id));
    }

    return NextResponse.json({
      synced: emailRecords.length,
      nextPageToken: result.nextPageToken,
      currentCount: currentDbCount,
      totalCount,
      isComplete,
    });
  } catch (error) {
    console.error("Error in /api/emails/sync/background:", error);

    const reauth = reauthErrorResponse(error);
    if (reauth) return reauth;

    return NextResponse.json(
      { error: "Failed to sync emails" },
      { status: 500 }
    );
  }
});
