import { withAuth } from "@/lib/api/with-auth";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const POST = withAuth(async (_request, user) => {
  try {
    await db
      .delete(accounts)
      .where(
        and(
          eq(accounts.userId, user.id),
          eq(accounts.provider, "google")
        )
      );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error unlinking Google account:", error);
    return Response.json(
      { error: "Failed to unlink Google account" },
      { status: 500 }
    );
  }
});
