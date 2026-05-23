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

    const settings = await db
      .select({ accessToken: readerSettings.accessToken })
      .from(readerSettings)
      .where(eq(readerSettings.userId, session.user.id))
      .limit(1);

    const connected = settings.length > 0 && Boolean(settings[0].accessToken);

    return NextResponse.json({ connected });
  } catch (error) {
    console.error("Error in /api/reader/status:", error);
    return NextResponse.json(
      { error: "Failed to check Reader status" },
      { status: 500 }
    );
  }
}
