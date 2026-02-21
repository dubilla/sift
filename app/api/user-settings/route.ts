import { auth } from "@/auth";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
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
      .from(userSettings)
      .where(eq(userSettings.userId, session.user.id))
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json({
        settings: { taskManager: "asana" },
      });
    }

    return NextResponse.json({
      settings: {
        taskManager: settings[0].taskManager,
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
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { taskManager } = body;

    if (!taskManager || !["asana", "todoist"].includes(taskManager)) {
      return NextResponse.json(
        { error: "Invalid task manager. Must be 'asana' or 'todoist'" },
        { status: 400 }
      );
    }

    await db
      .insert(userSettings)
      .values({
        userId: session.user.id,
        taskManager,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          taskManager,
          updatedAt: new Date(),
        },
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
