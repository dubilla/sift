import { withAuth } from "@/lib/api/with-auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { and, count, countDistinct, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

export const GET = withAuth(async (_request, user) => {
  try {
    // Count unique threads (not individual emails) that are unarchived
    const result = await db
      .select({ count: countDistinct(emails.threadId) })
      .from(emails)
      .where(
        and(
          eq(emails.userId, user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    return NextResponse.json({ count: result[0]?.count || 0 });
  } catch (error) {
    console.error("Error in /api/emails/count:", error);
    return NextResponse.json(
      { error: "Failed to fetch email count" },
      { status: 500 }
    );
  }
});
