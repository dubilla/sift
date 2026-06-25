import { getCurrentSession } from "@/lib/mobile-auth";
import { db } from "@/db";
import { crewSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await db
      .select({ baseUrl: crewSettings.baseUrl, apiToken: crewSettings.apiToken })
      .from(crewSettings)
      .where(eq(crewSettings.userId, session.user.id))
      .limit(1);

    const connected =
      settings.length > 0 &&
      Boolean(settings[0].baseUrl) &&
      Boolean(settings[0].apiToken);

    return NextResponse.json({ connected });
  } catch (error) {
    console.error("Error in /api/crew/status:", error);
    return NextResponse.json(
      { error: "Failed to check Crew status" },
      { status: 500 }
    );
  }
}
