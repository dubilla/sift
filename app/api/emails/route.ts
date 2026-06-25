import { withAuth } from "@/lib/api/with-auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export const GET = withAuth(async (_request, user) => {
  try {
    const userEmails = await db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.userId, user.id),
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
});
