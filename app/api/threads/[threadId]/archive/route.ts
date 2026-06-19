import { db } from "@/db";
import { emails, activityLog } from "@/db/schema";
import { archiveEmail } from "@/lib/services/gmail";
import { getCurrentSession } from "@/lib/mobile-auth";
import { eq, and, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = params;

    // Get all unarchived emails in this thread
    const threadEmails = await db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.threadId, threadId),
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    if (threadEmails.length === 0) {
      return NextResponse.json(
        { error: "Thread not found or already archived" },
        { status: 404 }
      );
    }

    // Get valid access token (refreshes if expired)
    const accessToken = await getValidAccessToken(session.user.id);

    // Archive all emails in Gmail
    await Promise.all(
      threadEmails.map((email) => archiveEmail(accessToken, email.externalId))
    );

    // Update all emails in database
    const emailIds = threadEmails.map((e) => e.id);
    await db
      .update(emails)
      .set({ archivedAt: new Date() })
      .where(eq(emails.threadId, threadId));

    // Log activity for each email
    const activityEntries = emailIds.map((emailId) => ({
      id: crypto.randomUUID(),
      userId: session.user.id,
      action: "archive" as const,
      emailId,
    }));

    await db.insert(activityLog).values(activityEntries);

    return NextResponse.json({ success: true, archivedCount: threadEmails.length });
  } catch (error) {
    console.error("Error in /api/threads/[threadId]/archive:", error);
    return NextResponse.json(
      { error: "Failed to archive thread" },
      { status: 500 }
    );
  }
}
