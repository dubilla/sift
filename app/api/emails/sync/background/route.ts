import { auth } from "@/auth";
import { db } from "@/db";
import { emails, userStats } from "@/db/schema";
import { getUnarchivedEmails } from "@/lib/services/gmail";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";
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

    if (emailRecords.length > 0) {
      await db
        .insert(emails)
        .values(emailRecords)
        .onConflictDoNothing({ target: emails.externalId });
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
