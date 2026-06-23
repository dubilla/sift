import { auth } from "@/auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { getUnarchivedEmails } from "@/lib/services/gmail";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";
import { reauthErrorResponse } from "@/lib/api/token-error";
import { classifyEmailsBatch } from "@/lib/services/classify-batch";
import { waitUntil } from "@vercel/functions";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get valid access token (refreshes if expired)
    const accessToken = await getValidAccessToken(session.user.id);

    // Parse request body for pagination params
    const body = await request.json().catch(() => ({}));
    const { pageToken, maxResults = 100 } = body;

    const result = await getUnarchivedEmails(accessToken, maxResults, pageToken);

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

    return NextResponse.json({
      synced: emailRecords.length,
      emails: result.emails,
      nextPageToken: result.nextPageToken,
    });
  } catch (error) {
    console.error("Error in /api/emails/sync:", error);
    const reauth = reauthErrorResponse(error);
    if (reauth) return reauth;
    return NextResponse.json(
      { error: "Failed to sync emails" },
      { status: 500 }
    );
  }
}
