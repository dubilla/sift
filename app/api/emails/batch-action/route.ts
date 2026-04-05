import { auth } from "@/auth";
import { db } from "@/db";
import {
  emails,
  activityLog,
  userSettings,
  asanaSettings,
  asanaTasks,
  todoistTasks,
} from "@/db/schema";
import { getValidAccessToken, getValidAccessTokenForProvider } from "@/lib/services/token";
import { createTask as createAsanaTask, getCurrentUser } from "@/lib/services/asana";
import { createTask as createTodoistTask } from "@/lib/services/todoist";
import { NextResponse } from "next/server";
import { eq, and, isNull, inArray } from "drizzle-orm";

interface BatchActionItem {
  emailId: string;
  action: "archive" | "unsubscribe" | "create_task";
}

interface ActionResult {
  emailId: string;
  action: string;
  success: boolean;
  error?: string;
  requiresMailto?: boolean;
  mailtoUrl?: string;
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { actions } = body as { actions: BatchActionItem[] };

    if (!Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json(
        { error: "actions array is required" },
        { status: 400 }
      );
    }

    if (actions.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 actions per batch" },
        { status: 400 }
      );
    }

    const validActions = ["archive", "unsubscribe", "create_task"];
    for (const item of actions) {
      if (!item.emailId || !validActions.includes(item.action)) {
        return NextResponse.json(
          { error: `Invalid action item: ${JSON.stringify(item)}` },
          { status: 400 }
        );
      }
    }

    // Fetch all referenced emails in one query
    const emailIds = Array.from(new Set(actions.map((a) => a.emailId)));
    const emailRows = await db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.userId, session.user.id),
          inArray(emails.id, emailIds),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    const emailById = new Map(emailRows.map((e) => [e.id, e]));

    // Get Gmail access token (needed for archive/unsubscribe)
    const accessToken = await getValidAccessToken(session.user.id);

    // Determine task manager settings upfront if any create_task actions
    const hasTaskActions = actions.some((a) => a.action === "create_task");
    let taskManager: "asana" | "todoist" = "asana";
    let taskAccessToken: string | null = null;
    let asanaUserGid: string | null = null;
    let asanaDefaults: { workspaceGid?: string; projectGid?: string } = {};
    let todoistDefaults: { projectId?: string } = {};

    if (hasTaskActions) {
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, session.user.id))
        .limit(1);

      taskManager = (settings?.taskManager === "todoist" ? "todoist" : "asana");

      try {
        taskAccessToken = await getValidAccessTokenForProvider(
          session.user.id,
          taskManager
        );
      } catch {
        // Task manager not connected - will fail individual task actions
      }

      if (taskManager === "asana" && taskAccessToken) {
        const [asanaConfig] = await db
          .select()
          .from(asanaSettings)
          .where(eq(asanaSettings.userId, session.user.id))
          .limit(1);

        asanaDefaults = {
          workspaceGid: asanaConfig?.defaultWorkspaceGid || undefined,
          projectGid: asanaConfig?.defaultProjectGid || undefined,
        };

        if (asanaConfig?.asanaUserGid) {
          asanaUserGid = asanaConfig.asanaUserGid;
        } else {
          try {
            const asanaUser = await getCurrentUser(taskAccessToken);
            asanaUserGid = asanaUser.gid;
          } catch {
            // Continue without assignee
          }
        }
      }

      if (taskManager === "todoist") {
        const { todoistSettings } = await import("@/db/schema");
        const [todoistConfig] = await db
          .select()
          .from(todoistSettings)
          .where(eq(todoistSettings.userId, session.user.id))
          .limit(1);

        todoistDefaults = {
          projectId: todoistConfig?.defaultProjectId || undefined,
        };
      }
    }

    // Collect emails to bulk-archive via Gmail batchModify
    const archiveExternalIds: string[] = [];
    const archiveInternalIds: string[] = [];
    const results: ActionResult[] = [];

    for (const item of actions) {
      const email = emailById.get(item.emailId);

      if (!email) {
        results.push({
          emailId: item.emailId,
          action: item.action,
          success: false,
          error: "Email not found or already archived",
        });
        continue;
      }

      if (item.action === "archive") {
        archiveExternalIds.push(email.externalId);
        archiveInternalIds.push(email.id);
        results.push({ emailId: email.id, action: "archive", success: true });
      } else if (item.action === "unsubscribe") {
        // Unsubscribe requires individual HTTP calls
        if (!email.hasUnsubscribe || !email.unsubscribeUrl) {
          results.push({
            emailId: email.id,
            action: "unsubscribe",
            success: false,
            error: "No unsubscribe URL available",
          });
          continue;
        }

        if (email.unsubscribeUrl.startsWith("mailto:")) {
          results.push({
            emailId: email.id,
            action: "unsubscribe",
            success: false,
            requiresMailto: true,
            mailtoUrl: email.unsubscribeUrl,
          });
          continue;
        }

        try {
          const unsubResponse = await fetch(email.unsubscribeUrl, {
            method: "GET",
            redirect: "follow",
          });

          if (!unsubResponse.ok) {
            results.push({
              emailId: email.id,
              action: "unsubscribe",
              success: false,
              error: `Unsubscribe request failed: ${unsubResponse.status}`,
            });
            continue;
          }

          // Also archive after unsubscribe
          archiveExternalIds.push(email.externalId);
          archiveInternalIds.push(email.id);
          results.push({ emailId: email.id, action: "unsubscribe", success: true });
        } catch (err) {
          results.push({
            emailId: email.id,
            action: "unsubscribe",
            success: false,
            error: "Unsubscribe request failed",
          });
        }
      } else if (item.action === "create_task") {
        if (!taskAccessToken) {
          results.push({
            emailId: email.id,
            action: "create_task",
            success: false,
            error: `${taskManager} not connected`,
          });
          continue;
        }

        const taskName = email.subject || "(No subject)";
        const taskNotes = `From: ${email.from}\n\nOriginal email snippet:\n${email.snippet || ""}`;

        try {
          if (taskManager === "asana") {
            if (!asanaDefaults.workspaceGid) {
              results.push({
                emailId: email.id,
                action: "create_task",
                success: false,
                error: "No Asana workspace configured",
              });
              continue;
            }

            const task = await createAsanaTask(taskAccessToken, {
              name: taskName,
              notes: taskNotes,
              workspaceGid: asanaDefaults.workspaceGid,
              projectGid: asanaDefaults.projectGid,
              assigneeGid: asanaUserGid || undefined,
            });

            await db.insert(asanaTasks).values({
              userId: session.user.id,
              emailId: email.id,
              asanaTaskGid: task.gid,
              asanaTaskUrl: task.permalink_url,
              taskName,
            });
          } else {
            const task = await createTodoistTask(taskAccessToken, {
              content: taskName,
              description: taskNotes,
              projectId: todoistDefaults.projectId,
            });

            await db.insert(todoistTasks).values({
              userId: session.user.id,
              emailId: email.id,
              todoistTaskId: task.id,
              todoistTaskUrl: task.url,
              taskName,
            });
          }

          results.push({ emailId: email.id, action: "create_task", success: true });
        } catch (err) {
          results.push({
            emailId: email.id,
            action: "create_task",
            success: false,
            error: `Failed to create ${taskManager} task`,
          });
        }
      }
    }

    // Bulk archive via Gmail batchModify (up to 1000 at a time)
    if (archiveExternalIds.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < archiveExternalIds.length; i += batchSize) {
        const batch = archiveExternalIds.slice(i, i + batchSize);

        const response = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ids: batch,
              removeLabelIds: ["INBOX"],
            }),
          }
        );

        if (!response.ok) {
          // Mark archive results as failed
          for (const result of results) {
            if (
              (result.action === "archive" || result.action === "unsubscribe") &&
              result.success
            ) {
              result.success = false;
              result.error = "Gmail batch archive failed";
            }
          }
        }
      }

      // Update database for successfully archived emails
      const successfulArchiveIds = results
        .filter((r) => (r.action === "archive" || r.action === "unsubscribe") && r.success)
        .map((r) => r.emailId);

      if (successfulArchiveIds.length > 0) {
        await db
          .update(emails)
          .set({ archivedAt: new Date() })
          .where(inArray(emails.id, successfulArchiveIds));
      }
    }

    // Log all successful actions
    const activityEntries = results
      .filter((r) => r.success)
      .map((r) => ({
        id: crypto.randomUUID(),
        userId: session.user.id,
        action: r.action === "create_task" ? `create_${taskManager}_task` : r.action,
        emailId: r.emailId,
      }));

    if (activityEntries.length > 0) {
      await db.insert(activityLog).values(activityEntries);
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: failed === 0,
      results,
      summary: { total: results.length, succeeded, failed },
    });
  } catch (error) {
    console.error("Error in /api/emails/batch-action:", error);
    return NextResponse.json(
      { error: "Failed to execute batch actions" },
      { status: 500 }
    );
  }
}
