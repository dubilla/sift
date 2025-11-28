import { auth } from "@/auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { and, eq, isNull, asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getFullEmail } from "@/lib/services/gmail";
import { getValidAccessToken } from "@/lib/services/token";

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

    // Get email IDs for this thread from database (including archived messages)
    const threadEmails = await db
      .select({
        id: emails.id,
        externalId: emails.externalId,
        date: emails.date,
        archivedAt: emails.archivedAt,
      })
      .from(emails)
      .where(
        and(
          eq(emails.threadId, threadId),
          eq(emails.userId, session.user.id),
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

    // Get user's valid access token (refreshes if expired)
    const accessToken = await getValidAccessToken(session.user.id);

    // Fetch full email bodies from Gmail API
    const messages = await Promise.all(
      threadEmails.map(async (email) => {
        const fullEmail = await getFullEmail(accessToken, email.externalId);
        return {
          ...fullEmail,
          id: email.id,
          archivedAt: email.archivedAt,
        };
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
