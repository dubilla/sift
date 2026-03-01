import { auth } from "@/auth";
import { db } from "@/db";
import { readerSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [settings] = await db
      .select()
      .from(readerSettings)
      .where(eq(readerSettings.userId, session.user.id))
      .limit(1);

    return NextResponse.json({
      connected: !!settings?.apiToken,
    });
  } catch (error) {
    console.error("Error in GET /api/reader/status:", error);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
    );
  }
}
