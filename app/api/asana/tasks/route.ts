import { auth } from "@/auth";
import { db } from "@/db";
import { asanaTasks, activityLog } from "@/db/schema";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { createTask } from "@/lib/services/asana";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, notes, projectGid, workspaceGid, dueOn, emailId } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Task name is required" },
        { status: 400 }
      );
    }

    if (!workspaceGid) {
      return NextResponse.json(
        { error: "Workspace is required" },
        { status: 400 }
      );
    }

    const accessToken = await getValidAccessTokenForProvider(
      session.user.id,
      "asana"
    );

    const task = await createTask(accessToken, {
      name,
      notes,
      projectGid,
      workspaceGid,
      dueOn,
    });

    // Store the task in our database
    await db.insert(asanaTasks).values({
      userId: session.user.id,
      emailId: emailId || null,
      asanaTaskGid: task.gid,
      asanaTaskUrl: task.permalink_url,
      taskName: name,
    });

    // Log activity
    await db.insert(activityLog).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      action: "create_asana_task",
      emailId: emailId || null,
    });

    return NextResponse.json({
      success: true,
      task: {
        gid: task.gid,
        name: task.name,
        url: task.permalink_url,
      },
    });
  } catch (error) {
    console.error("Error in /api/asana/tasks:", error);

    if (error instanceof Error && error.message.includes("No asana account")) {
      return NextResponse.json(
        { error: "Asana not connected" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
