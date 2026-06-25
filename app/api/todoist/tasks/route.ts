import { getCurrentSession } from "@/lib/mobile-auth";
import { db } from "@/db";
import { todoistTasks, activityLog } from "@/db/schema";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { createTask } from "@/lib/services/todoist";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { content, description, projectId, dueDate, emailId } = body;

    if (!content) {
      return NextResponse.json(
        { error: "Task content is required" },
        { status: 400 }
      );
    }

    const accessToken = await getValidAccessTokenForProvider(
      session.user.id,
      "todoist"
    );

    const task = await createTask(accessToken, {
      content,
      description,
      projectId,
      dueDate,
    });

    // Store the task in our database
    await db.insert(todoistTasks).values({
      userId: session.user.id,
      emailId: emailId || null,
      todoistTaskId: task.id,
      todoistTaskUrl: task.url,
      taskName: content,
    });

    // Log activity
    await db.insert(activityLog).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      action: "create_todoist_task",
      emailId: emailId || null,
    });

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        content: task.content,
        url: task.url,
      },
    });
  } catch (error) {
    console.error("Error in /api/todoist/tasks:", error);

    if (error instanceof Error && error.message.includes("No todoist account")) {
      return NextResponse.json(
        { error: "Todoist not connected" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
