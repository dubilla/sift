import { getCurrentSession } from "@/lib/mobile-auth";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, session.user.id))
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json({
        settings: { taskManager: "asana", timezone: null },
      });
    }

    return NextResponse.json({
      settings: {
        taskManager: settings[0].taskManager,
        timezone: settings[0].timezone,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/user-settings:", error);
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
    const { taskManager, timezone } = body;

    const update: { taskManager?: string; timezone?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (taskManager !== undefined) {
      if (!["asana", "todoist", "crew"].includes(taskManager)) {
        return NextResponse.json(
          { error: "Invalid task manager. Must be 'asana', 'todoist', or 'crew'" },
          { status: 400 }
        );
      }
      update.taskManager = taskManager;
    }

    if (timezone !== undefined) {
      if (timezone !== null && !isValidTimezone(timezone)) {
        return NextResponse.json(
          { error: "Invalid timezone" },
          { status: 400 }
        );
      }
      update.timezone = timezone;
    }

    await db
      .insert(userSettings)
      .values({
        userId: session.user.id,
        taskManager: update.taskManager ?? "asana",
        timezone: update.timezone ?? null,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: update,
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/user-settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
