import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { emails, activityLog } from "@/db/schema";
import { inArray, and, isNull } from "drizzle-orm";
import { getValidAccessToken } from "@/lib/services/token";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadIds } = await request.json();

    if (!Array.isArray(threadIds) || threadIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid thread IDs" },
        { status: 400 }
      );
    }

    // Get all unarchived email IDs for the threads
    const threadEmails = await db
      .select({ id: emails.id })
      .from(emails)
      .where(
        and(
          inArray(emails.threadId, threadIds),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    if (threadEmails.length === 0) {
      return NextResponse.json(
        { error: "No emails found for the specified threads" },
        { status: 404 }
      );
    }

    // Get valid access token (refreshes if expired)
    const accessToken = await getValidAccessToken(session.user.id);

    // Archive emails in database
    await db
      .update(emails)
      .set({ archivedAt: new Date() })
      .where(inArray(emails.threadId, threadIds));

    // Batch modify to remove INBOX label from all emails (id is the Gmail message ID)
    const gmailIds = threadEmails.map((email) => email.id);

    // Gmail API supports batch modify with up to 1000 IDs at a time
    const batchSize = 1000;
    for (let i = 0; i < gmailIds.length; i += batchSize) {
      const batch = gmailIds.slice(i, i + batchSize);

      const response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids: batch,
            removeLabelIds: ["INBOX"],
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to archive emails via Gmail API");
      }
    }

    // Log activity for each email
    const activityEntries = threadEmails.map((email) => ({
      id: crypto.randomUUID(),
      userId: session.user.id,
      action: "archive" as const,
      emailId: email.id,
    }));

    await db.insert(activityLog).values(activityEntries);

    return NextResponse.json({
      success: true,
      archivedCount: threadEmails.length,
    });
  } catch (error) {
    console.error("Bulk archive error:", error);
    return NextResponse.json(
      { error: "Failed to bulk archive threads" },
      { status: 500 }
    );
  }
}
