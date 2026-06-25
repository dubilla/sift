import { withAuth } from "@/lib/api/with-auth";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const GET = withAuth(async (_request, user) => {
  try {
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, user.id),
          eq(accounts.provider, "google")
        )
      )
      .limit(1);

    if (!userAccounts.length) {
      return Response.json({
        hasValidToken: false,
        needsReconnect: true,
        message: "No Google account connected",
      });
    }

    const account = userAccounts[0];
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = account.expires_at || 0;
    const isExpired = expiresAt < now;

    if (isExpired && !account.refresh_token) {
      return Response.json({
        hasValidToken: false,
        needsReconnect: true,
        message: "Google account connection has expired. Please re-connect.",
      });
    }

    return Response.json({
      hasValidToken: true,
      needsReconnect: false,
    });
  } catch (error) {
    console.error("Error checking token status:", error);
    return Response.json(
      { error: "Failed to check token status" },
      { status: 500 }
    );
  }
});
