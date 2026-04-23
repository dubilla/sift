import { auth } from "@/auth";
import { db } from "@/db";
import { crewSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await db
      .select()
      .from(crewSettings)
      .where(eq(crewSettings.userId, session.user.id))
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json({ settings: null });
    }

    return NextResponse.json({
      settings: {
        baseUrl: settings[0].baseUrl,
        hasApiToken: Boolean(settings[0].apiToken),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/crew/settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    const apiToken = typeof body.apiToken === "string" ? body.apiToken.trim() : "";

    if (!baseUrl || !apiToken) {
      return NextResponse.json(
        { error: "baseUrl and apiToken are required" },
        { status: 400 }
      );
    }

    try {
      new URL(baseUrl);
    } catch {
      return NextResponse.json(
        { error: "baseUrl must be a valid URL" },
        { status: 400 }
      );
    }

    await db
      .insert(crewSettings)
      .values({
        userId: session.user.id,
        baseUrl,
        apiToken,
      })
      .onConflictDoUpdate({
        target: crewSettings.userId,
        set: {
          baseUrl,
          apiToken,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/crew/settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db
      .delete(crewSettings)
      .where(eq(crewSettings.userId, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/crew/settings:", error);
    return NextResponse.json(
      { error: "Failed to delete settings" },
      { status: 500 }
    );
  }
}
