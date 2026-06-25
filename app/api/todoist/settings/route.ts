import { getCurrentSession } from "@/lib/mobile-auth";
import { db } from "@/db";
import { todoistSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await db
      .select()
      .from(todoistSettings)
      .where(eq(todoistSettings.userId, session.user.id))
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json({ settings: null });
    }

    return NextResponse.json({
      settings: {
        defaultProjectId: settings[0].defaultProjectId,
        defaultProjectName: settings[0].defaultProjectName,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/todoist/settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { defaultProjectId, defaultProjectName } = body;

    await db
      .insert(todoistSettings)
      .values({
        userId: session.user.id,
        defaultProjectId,
        defaultProjectName,
      })
      .onConflictDoUpdate({
        target: todoistSettings.userId,
        set: {
          defaultProjectId,
          defaultProjectName,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/todoist/settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
