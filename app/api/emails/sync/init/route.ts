import { withAuth } from "@/lib/api/with-auth";
import { db } from "@/db";
import { userStats } from "@/db/schema";
import { getUnarchivedEmailCount } from "@/lib/services/gmail";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";
import { reauthErrorResponse } from "@/lib/api/token-error";
import { eq } from "drizzle-orm";

export const POST = withAuth(async (_request, user) => {
  try {
    const accessToken = await getValidAccessToken(user.id);

    // Get the total unarchived count from Gmail
    const totalCount = await getUnarchivedEmailCount(accessToken);

    // Store it in user_stats for progress tracking
    await db
      .insert(userStats)
      .values({
        userId: user.id,
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
    const reauth = reauthErrorResponse(error);
    if (reauth) return reauth;
    return NextResponse.json(
      { error: "Failed to initialize sync" },
      { status: 500 }
    );
  }
});
