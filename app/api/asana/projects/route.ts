import { auth } from "@/auth";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { getProjects } from "@/lib/services/asana";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceGid = searchParams.get("workspaceGid");

    if (!workspaceGid) {
      return NextResponse.json(
        { error: "Workspace GID is required" },
        { status: 400 }
      );
    }

    const accessToken = await getValidAccessTokenForProvider(
      session.user.id,
      "asana"
    );

    const projects = await getProjects(accessToken, workspaceGid);

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error in /api/asana/projects:", error);

    if (error instanceof Error && error.message.includes("No asana account")) {
      return NextResponse.json(
        { error: "Asana not connected" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}
