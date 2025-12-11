import { auth } from "@/auth";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { getWorkspaces } from "@/lib/services/asana";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = await getValidAccessTokenForProvider(
      session.user.id,
      "asana"
    );

    const workspaces = await getWorkspaces(accessToken);

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error("Error in /api/asana/workspaces:", error);

    if (error instanceof Error && error.message.includes("No asana account")) {
      return NextResponse.json(
        { error: "Asana not connected" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}
