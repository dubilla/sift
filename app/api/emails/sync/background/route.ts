import { auth } from "@/auth";
import { db } from "@/db";
import { emails, userStats } from "@/db/schema";
import { getUnarchivedEmails } from "@/lib/services/gmail";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";
import { eq, and, isNull, count } from "drizzle-orm";

export async function POST(request: Request) {
  // MIGRATION STEP 1: Syncing paused during ID migration
  return NextResponse.json(
    { error: "Syncing temporarily disabled during migration" },
    { status: 503 }
  );

  // eslint-disable-next-line no-unreachable
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get valid access token (refreshes if expired)
    // @ts-expect-error - Unreachable during migration
    const accessToken = await getValidAccessToken(session.user.id);

    // Parse request body for pagination params
    const body = await request.json().catch(() => ({}));
    const { pageToken } = body;

    // Fetch next batch of emails
    const result = await getUnarchivedEmails(accessToken, 100, pageToken);

    const emailRecords = result.emails.map((email) => ({
      id: email.id,
      externalId: email.id, // Will be properly set in Step 4
      // @ts-expect-error - Unreachable during migration
      userId: session.user.id,
      threadId: email.threadId,
      subject: email.subject,
      from: email.from,
      to: email.to,
      snippet: email.snippet,
      date: email.date,
      archivedAt: null,
      deletedAt: null,
      hasUnsubscribe: false,
      unsubscribeUrl: null,
    }));

    if (emailRecords.length > 0) {
      await db
        .insert(emails)
        .values(emailRecords)
        .onConflictDoNothing({ target: emails.id });
    }

    // Get current count of unarchived emails in DB
    const dbCountResult = await db
      .select({ count: count() })
      .from(emails)
      .where(
        and(
          // @ts-expect-error - Unreachable during migration
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    const currentDbCount = dbCountResult[0]?.count || 0;

    // Get total count from user_stats
    const statsResult = await db
      .select()
      .from(userStats)
      // @ts-expect-error - Unreachable during migration
      .where(eq(userStats.userId, session.user.id));

    const totalCount = statsResult[0]?.totalUnarchivedCount || 0;

    return NextResponse.json({
      synced: emailRecords.length,
      nextPageToken: result.nextPageToken,
      currentCount: currentDbCount,
      totalCount,
      isComplete: !result.nextPageToken,
    });
  } catch (error) {
    console.error("Error in /api/emails/sync/background:", error);
    return NextResponse.json(
      { error: "Failed to sync emails" },
      { status: 500 }
    );
  }
}
