import { getCurrentSession } from "@/lib/mobile-auth";
import { db } from "@/db";
import { activityLog, crewSettings, crewTasks } from "@/db/schema";
import { createTask } from "@/lib/services/crew";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, dueDate, assignee, emailId } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "Task title is required" },
        { status: 400 }
      );
    }

    const settings = await db
      .select()
      .from(crewSettings)
      .where(eq(crewSettings.userId, session.user.id))
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json(
        { error: "Crew not connected" },
        { status: 403 }
      );
    }

    const task = await createTask(settings[0].baseUrl, settings[0].apiToken, {
      title: title.trim(),
      description,
      dueDate,
      assignee,
    });

    await db.insert(crewTasks).values({
      userId: session.user.id,
      emailId: emailId || null,
      crewTaskId: task.id,
      crewTaskUrl: task.url,
      taskName: task.title,
    });

    await db.insert(activityLog).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      action: "create_crew_task",
      emailId: emailId || null,
    });

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        url: task.url,
      },
    });
  } catch (error) {
    console.error("Error in /api/crew/tasks:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
