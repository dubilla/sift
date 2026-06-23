import { auth } from "@/auth";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { createFilter } from "@/lib/services/gmail";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";
import { reauthErrorResponse } from "@/lib/api/token-error";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { senderEmail, applyToExisting } = body;

    if (!senderEmail) {
      return NextResponse.json(
        { error: "Sender email is required" },
        { status: 400 }
      );
    }

    // Get valid access token (refreshes if expired)
    const accessToken = await getValidAccessToken(session.user.id);

    // Create filter in Gmail
    const result = await createFilter(
      accessToken,
      senderEmail,
      applyToExisting || false
    );

    // Log activity
    await db.insert(activityLog).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      action: "create_filter",
    });

    return NextResponse.json({
      success: true,
      filterId: result.id,
      senderEmail: result.senderEmail,
      archivedCount: result.archived,
    });
  } catch (error) {
    console.error("Error in /api/filters/create:", error);
    const reauth = reauthErrorResponse(error);
    if (reauth) return reauth;
    return NextResponse.json(
      { error: "Failed to create filter" },
      { status: 500 }
    );
  }
}
