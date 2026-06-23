import { auth } from "@/auth";
import { db } from "@/db";
import { asanaTasks, activityLog, asanaSettings } from "@/db/schema";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { createTask, getCurrentUser } from "@/lib/services/asana";
import { reauthErrorResponse } from "@/lib/api/token-error";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

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

    // Get or fetch Asana user GID
    let asanaUserGid: string | null = null;
    const [settings] = await db
      .select()
      .from(asanaSettings)
      .where(eq(asanaSettings.userId, session.user.id))
      .limit(1);

    if (settings?.asanaUserGid) {
      asanaUserGid = settings.asanaUserGid;
    } else {
      // Fetch and store user GID
      try {
        const asanaUser = await getCurrentUser(accessToken);
        asanaUserGid = asanaUser.gid;

        // Store it for future use
        if (settings) {
          await db
            .update(asanaSettings)
            .set({ asanaUserGid: asanaUser.gid })
            .where(eq(asanaSettings.userId, session.user.id));
        } else {
          await db.insert(asanaSettings).values({
            userId: session.user.id,
            asanaUserGid: asanaUser.gid,
          });
        }
      } catch (err) {
        console.error("Error fetching Asana user GID:", err);
        // Continue without assignee if fetch fails
      }
    }

    const task = await createTask(accessToken, {
      name,
      notes,
      projectGid,
      workspaceGid,
      dueOn,
      assigneeGid: asanaUserGid || undefined,
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

    const reauth = reauthErrorResponse(error);
    if (reauth) return reauth;

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
