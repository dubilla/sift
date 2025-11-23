import { auth } from "@/auth";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { getUnarchivedEmailCount } from "@/lib/services/gmail";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id))
      .limit(1);

    if (!userAccounts.length || !userAccounts[0].access_token) {
      return NextResponse.json(
        { error: "No access token found" },
        { status: 400 }
      );
    }

    const count = await getUnarchivedEmailCount(userAccounts[0].access_token);

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error in /api/emails/count:", error);
    return NextResponse.json(
      { error: "Failed to fetch email count" },
      { status: 500 }
    );
  }
}
