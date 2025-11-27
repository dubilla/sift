import { auth } from "@/auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { getUnarchivedEmails } from "@/lib/services/gmail";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";

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
    const { pageToken, maxResults = 100 } = body;

    const result = await getUnarchivedEmails(accessToken, maxResults, pageToken);

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

    return NextResponse.json({
      synced: emailRecords.length,
      emails: result.emails,
      nextPageToken: result.nextPageToken,
    });
  } catch (error) {
    console.error("Error in /api/emails/sync:", error);
    return NextResponse.json(
      { error: "Failed to sync emails" },
      { status: 500 }
    );
  }
}
