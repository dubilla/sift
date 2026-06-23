import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { emails, activityLog } from "@/db/schema";
import { inArray, and, isNull } from "drizzle-orm";
import { batchArchiveEmails } from "@/lib/services/gmail";
import { getValidAccessToken } from "@/lib/services/token";
import { reauthErrorResponse } from "@/lib/api/token-error";

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
      .select({ id: emails.id, externalId: emails.externalId })
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

    const gmailIds = threadEmails.map((email) => email.externalId);
    await batchArchiveEmails(accessToken, gmailIds);

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
    const reauth = reauthErrorResponse(error);
    if (reauth) return reauth;
    return NextResponse.json(
      { error: "Failed to bulk archive threads" },
      { status: 500 }
    );
  }
}
