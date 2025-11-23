import { auth } from "@/auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userEmails = await db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      )
      .orderBy(desc(emails.date))
      .limit(100);

    return NextResponse.json({ emails: userEmails });
  } catch (error) {
    console.error("Error in /api/emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}
