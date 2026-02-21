import { auth } from "@/auth";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { getProjects } from "@/lib/services/todoist";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = await getValidAccessTokenForProvider(
      session.user.id,
      "todoist"
    );

    const projects = await getProjects(accessToken);

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error in /api/todoist/projects:", error);

    if (error instanceof Error && error.message.includes("No todoist account")) {
      return NextResponse.json(
        { error: "Todoist not connected" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
