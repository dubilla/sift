import { auth } from "@/auth";
import { db } from "@/db";
import { accounts, emails } from "@/db/schema";
import { getUnarchivedEmails } from "@/lib/services/gmail";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const gmailEmails = await getUnarchivedEmails(
      userAccounts[0].access_token,
      100
    );

    const emailRecords = gmailEmails.map((email) => ({
      id: email.id,
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

    await db
      .insert(emails)
      .values(emailRecords)
      .onConflictDoNothing({ target: emails.id });

    return NextResponse.json({
      synced: emailRecords.length,
      emails: gmailEmails,
    });
  } catch (error) {
    console.error("Error in /api/emails/sync:", error);
    return NextResponse.json(
      { error: "Failed to sync emails" },
      { status: 500 }
    );
  }
}
