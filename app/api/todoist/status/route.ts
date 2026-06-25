import { getCurrentSession } from "@/lib/mobile-auth";
import { hasProviderAccount } from "@/lib/services/token";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connected = await hasProviderAccount(session.user.id, "todoist");

    return NextResponse.json({ connected });
  } catch (error) {
    console.error("Error in /api/todoist/status:", error);
    return NextResponse.json(
      { error: "Failed to check Todoist status" },
      { status: 500 }
    );
  }
}
