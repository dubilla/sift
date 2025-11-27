import { auth } from "@/auth";
import { db } from "@/db";
import { emails, activityLog } from "@/db/schema";
import { and, count, countDistinct, eq, gte, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Get total unarchived count (unique threads)
    const unarchivedResult = await db
      .select({ count: countDistinct(emails.threadId) })
      .from(emails)
      .where(
        and(
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    // Get parsed today count (all archive actions today)
    const todayResult = await db
      .select({ count: count() })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.userId, session.user.id),
          eq(activityLog.action, "archive"),
          gte(activityLog.createdAt, startOfToday)
        )
      );

    // Get parsed this week count (all archive actions in last 7 days)
    const weekResult = await db
      .select({ count: count() })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.userId, session.user.id),
          eq(activityLog.action, "archive"),
          gte(activityLog.createdAt, sevenDaysAgo)
        )
      );

    // Get velocity (emails per minute in last 5 minutes)
    const recentResult = await db
      .select({ count: count() })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.userId, session.user.id),
          eq(activityLog.action, "archive"),
          gte(activityLog.createdAt, fiveMinutesAgo)
        )
      );

    const recentCount = recentResult[0]?.count || 0;
    const velocity = recentCount / 5; // emails per minute

    return NextResponse.json({
      totalUnarchived: unarchivedResult[0]?.count || 0,
      parsedToday: todayResult[0]?.count || 0,
      parsedThisWeek: weekResult[0]?.count || 0,
      velocity: Number(velocity.toFixed(1)),
    });
  } catch (error) {
    console.error("Error in /api/stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
