import { auth } from "@/auth";
import { db } from "@/db";
import { asanaSettings } from "@/db/schema";
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
      .from(asanaSettings)
      .where(eq(asanaSettings.userId, session.user.id))
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json({ settings: null });
    }

    return NextResponse.json({
      settings: {
        defaultWorkspaceGid: settings[0].defaultWorkspaceGid,
        defaultWorkspaceName: settings[0].defaultWorkspaceName,
        defaultProjectGid: settings[0].defaultProjectGid,
        defaultProjectName: settings[0].defaultProjectName,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/asana/settings:", error);
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
    const {
      defaultWorkspaceGid,
      defaultWorkspaceName,
      defaultProjectGid,
      defaultProjectName,
    } = body;

    // Upsert settings
    await db
      .insert(asanaSettings)
      .values({
        userId: session.user.id,
        defaultWorkspaceGid,
        defaultWorkspaceName,
        defaultProjectGid,
        defaultProjectName,
      })
      .onConflictDoUpdate({
        target: asanaSettings.userId,
        set: {
          defaultWorkspaceGid,
          defaultWorkspaceName,
          defaultProjectGid,
          defaultProjectName,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/asana/settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
