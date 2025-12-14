import { auth } from "@/auth";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db
      .delete(accounts)
      .where(
        and(
          eq(accounts.userId, session.user.id),
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
}
