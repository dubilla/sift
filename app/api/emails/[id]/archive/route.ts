import { auth } from "@/auth";
import { db } from "@/db";
import { accounts, emails, userStats, activityLog } from "@/db/schema";
import { archiveEmail } from "@/lib/services/gmail";
import { eq, and, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailId = params.id;

    const existingEmail = await db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.id, emailId),
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt)
        )
      )
      .limit(1);

    if (!existingEmail.length) {
      return NextResponse.json(
        { error: "Email not found or already archived" },
        { status: 404 }
      );
    }

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

    await archiveEmail(userAccounts[0].access_token, emailId);

    await db
      .update(emails)
      .set({ archivedAt: new Date() })
      .where(eq(emails.id, emailId));

    await db
      .insert(activityLog)
      .values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        action: "archive",
        emailId: emailId,
      });

    const stats = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, session.user.id))
      .limit(1);

    if (stats.length) {
      const newCount = Math.max(0, (stats[0].totalUnarchived || 0) - 1);
      await db
        .update(userStats)
        .set({
          totalUnarchived: newCount,
          updatedAt: new Date(),
        })
        .where(eq(userStats.userId, session.user.id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in /api/emails/[id]/archive:", error);
    return NextResponse.json(
      { error: "Failed to archive email" },
      { status: 500 }
    );
  }
}
