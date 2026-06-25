import { getCurrentSession } from "@/lib/mobile-auth";
import { db } from "@/db";
import { readerSettings } from "@/db/schema";
import { validateToken } from "@/lib/services/reader";
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
      .from(readerSettings)
      .where(eq(readerSettings.userId, session.user.id))
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json({ settings: null });
    }

    return NextResponse.json({
      settings: {
        hasAccessToken: Boolean(settings[0].accessToken),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/reader/settings:", error);
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
    const accessToken =
      typeof body.accessToken === "string" ? body.accessToken.trim() : "";

    if (!accessToken) {
      return NextResponse.json(
        { error: "accessToken is required" },
        { status: 400 }
      );
    }

    const isValid = await validateToken(accessToken);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid Readwise access token" },
        { status: 400 }
      );
    }

    await db
      .insert(readerSettings)
      .values({
        userId: session.user.id,
        accessToken,
      })
      .onConflictDoUpdate({
        target: readerSettings.userId,
        set: {
          accessToken,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/reader/settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await db
      .delete(readerSettings)
      .where(eq(readerSettings.userId, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/reader/settings:", error);
    return NextResponse.json(
      { error: "Failed to delete settings" },
      { status: 500 }
    );
  }
}
