import { auth } from "@/auth";
import { db } from "@/db";
import { emails, accounts } from "@/db/schema";
import { and, eq, isNull, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getFullEmail } from "@/lib/services/gmail";

export async function GET(
  request: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { threadId } = params;

    // Get email IDs for this thread from database
    const threadEmails = await db
      .select({
        id: emails.id,
        date: emails.date,
      })
      .from(emails)
      .where(
        and(
          eq(emails.threadId, threadId),
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      )
      .orderBy(asc(emails.date));

    if (threadEmails.length === 0) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get user's access token
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

    // Fetch full email bodies from Gmail API
    const messages = await Promise.all(
      threadEmails.map(async (email) => {
        const fullEmail = await getFullEmail(accessToken, email.id);
        return fullEmail;
      })
    );

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Error in /api/threads/[threadId]/messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch thread messages" },
      { status: 500 }
    );
  }
}
