import { auth } from "@/auth";
import { hasProviderAccount } from "@/lib/services/token";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connected = await hasProviderAccount(session.user.id, "asana");

    return NextResponse.json({ connected });
  } catch (error) {
    console.error("Error in /api/asana/status:", error);
    return NextResponse.json(
      { error: "Failed to check Asana status" },
      { status: 500 }
    );
  }
}
