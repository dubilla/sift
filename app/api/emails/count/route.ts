import { auth } from "@/auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { and, count, countDistinct, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();


    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Count unique threads (not individual emails) that are unarchived
    const result = await db
      .select({ count: countDistinct(emails.threadId) })
      .from(emails)
      .where(
        and(
          eq(emails.userId, session.user.id),
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
}
