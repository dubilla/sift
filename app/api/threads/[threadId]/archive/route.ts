import { auth } from "@/auth";
import { db } from "@/db";
import { accounts, emails, userStats, activityLog } from "@/db/schema";
import { archiveEmail } from "@/lib/services/gmail";
import { eq, and, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const session = await auth();

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

    // Get access token
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id))
      .limit(1);

    if (!userAccounts.length || !userAccounts[0].access_token) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 400 }
      );
    }

    const accessToken = userAccounts[0].access_token;

    // Archive all emails in Gmail
    await Promise.all(
      threadEmails.map((email) => archiveEmail(accessToken, email.id))
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

    // Update user stats
    const stats = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, session.user.id))
      .limit(1);

    if (stats.length) {
      const archivedCount = threadEmails.length;
      const newCount = Math.max(0, (stats[0].totalUnarchived || 0) - archivedCount);
      await db
        .update(userStats)
        .set({
          totalUnarchived: newCount,
          updatedAt: new Date(),
        })
        .where(eq(userStats.userId, session.user.id));
    }

    return NextResponse.json({ success: true, archivedCount: threadEmails.length });
  } catch (error) {
    console.error("Error in /api/threads/[threadId]/archive:", error);
    return NextResponse.json(
      { error: "Failed to archive thread" },
      { status: 500 }
    );
  }
}
