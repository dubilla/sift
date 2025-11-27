import { auth } from "@/auth";
import { db } from "@/db";
import { userStats } from "@/db/schema";
import { getUnarchivedEmailCount } from "@/lib/services/gmail";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";
import { eq } from "drizzle-orm";

export async function POST() {
  // MIGRATION STEP 1: Syncing paused during ID migration
  return NextResponse.json(
    { error: "Syncing temporarily disabled during migration" },
    { status: 503 }
  );

  // eslint-disable-next-line no-unreachable
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // @ts-expect-error - Unreachable during migration
    const accessToken = await getValidAccessToken(session.user.id);

    // Get the total unarchived count from Gmail
    const totalCount = await getUnarchivedEmailCount(accessToken);

    // Store it in user_stats for progress tracking
    await db
      .insert(userStats)
      .values({
        // @ts-expect-error - Unreachable during migration
        userId: session.user.id,
        totalUnarchivedCount: totalCount,
        totalUnarchived: totalCount,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userStats.userId,
        set: {
          totalUnarchivedCount: totalCount,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({
      totalCount,
    });
  } catch (error) {
    console.error("Error in /api/emails/sync/init:", error);
    return NextResponse.json(
      { error: "Failed to initialize sync" },
      { status: 500 }
    );
  }
}
