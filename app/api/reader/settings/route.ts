import { auth } from "@/auth";
import { db } from "@/db";
import { readerSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/services/reader";

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
      settings: settings
        ? {
            hasToken: true,
            createdAt: settings.createdAt,
            updatedAt: settings.updatedAt,
          }
        : null,
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
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { apiToken } = body;

    if (!apiToken) {
      return NextResponse.json(
        { error: "API token is required" },
        { status: 400 }
      );
    }

    // Verify the token works
    const isValid = await verifyToken(apiToken);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid API token. Please check your token and try again." },
        { status: 400 }
      );
    }

    // Upsert settings
    const existing = await db
      .select()
      .from(readerSettings)
      .where(eq(readerSettings.userId, session.user.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(readerSettings)
        .set({
          apiToken,
          updatedAt: new Date(),
        })
        .where(eq(readerSettings.userId, session.user.id));
    } else {
      await db.insert(readerSettings).values({
        userId: session.user.id,
        apiToken,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/reader/settings:", error);
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
