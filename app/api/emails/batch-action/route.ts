import { withAuth } from "@/lib/api/with-auth";
import { db } from "@/db";
import {
  emails,
  activityLog,
  userSettings,
  asanaSettings,
  asanaTasks,
  todoistSettings,
  todoistTasks,
} from "@/db/schema";
import { batchArchiveEmails } from "@/lib/services/gmail";
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

export const POST = withAuth(async (request, user) => {
  try {
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

    const emailIds = Array.from(new Set(actions.map((a) => a.emailId)));
    const emailRows = await db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.userId, user.id),
          inArray(emails.id, emailIds),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    const emailById = new Map(emailRows.map((e) => [e.id, e]));

    const needsGmailToken = actions.some(
      (a) => a.action === "archive" || a.action === "unsubscribe"
    );
    const accessToken = needsGmailToken
      ? await getValidAccessToken(user.id)
      : null;

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
        .where(eq(userSettings.userId, user.id))
        .limit(1);

      taskManager = settings?.taskManager === "todoist" ? "todoist" : "asana";

      try {
        taskAccessToken = await getValidAccessTokenForProvider(
          user.id,
          taskManager
        );
      } catch {
        // Task manager not connected - will fail individual task actions
      }

      if (taskManager === "asana" && taskAccessToken) {
        const [asanaConfig] = await db
          .select()
          .from(asanaSettings)
          .where(eq(asanaSettings.userId, user.id))
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

      if (taskManager === "todoist" && taskAccessToken) {
        const [todoistConfig] = await db
          .select()
          .from(todoistSettings)
          .where(eq(todoistSettings.userId, user.id))
          .limit(1);

        todoistDefaults = {
          projectId: todoistConfig?.defaultProjectId || undefined,
        };
      }
    }

    const archiveExternalIds: string[] = [];
    const results: ActionResult[] = [];

    // Collect unsubscribe work to run in parallel
    const unsubscribeWork: {
      email: (typeof emailRows)[0];
      url: string;
    }[] = [];

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
        results.push({ emailId: email.id, action: "archive", success: true });
      } else if (item.action === "unsubscribe") {
        if (!email.hasUnsubscribe || !email.unsubscribeUrl) {
          results.push({
            emailId: email.id,
            action: "unsubscribe",
            success: false,
            error: "No unsubscribe URL available",
          });
        } else if (email.unsubscribeUrl.startsWith("mailto:")) {
          results.push({
            emailId: email.id,
            action: "unsubscribe",
            success: false,
            requiresMailto: true,
            mailtoUrl: email.unsubscribeUrl,
          });
        } else {
          unsubscribeWork.push({ email, url: email.unsubscribeUrl });
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
              userId: user.id,
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
              userId: user.id,
              emailId: email.id,
              todoistTaskId: task.id,
              todoistTaskUrl: task.url,
              taskName,
            });
          }

          results.push({ emailId: email.id, action: "create_task", success: true });
        } catch {
          results.push({
            emailId: email.id,
            action: "create_task",
            success: false,
            error: `Failed to create ${taskManager} task`,
          });
        }
      }
    }

    // Run unsubscribe requests in parallel
    if (unsubscribeWork.length > 0) {
      const unsubResults = await Promise.allSettled(
        unsubscribeWork.map(async ({ email, url }) => {
          const resp = await fetch(url, { method: "GET", redirect: "follow" });
          return { email, ok: resp.ok, status: resp.status };
        })
      );

      for (let i = 0; i < unsubResults.length; i++) {
        const result = unsubResults[i];
        const { email } = unsubscribeWork[i];

        if (result.status === "fulfilled" && result.value.ok) {
          archiveExternalIds.push(email.externalId);
          results.push({ emailId: email.id, action: "unsubscribe", success: true });
        } else {
          const status = result.status === "fulfilled" ? result.value.status : 0;
          results.push({
            emailId: email.id,
            action: "unsubscribe",
            success: false,
            error: `Unsubscribe request failed${status ? `: ${status}` : ""}`,
          });
        }
      }
    }

    if (archiveExternalIds.length > 0) {
      try {
        await batchArchiveEmails(accessToken!, archiveExternalIds);
      } catch {
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

    const activityEntries = results
      .filter((r) => r.success)
      .map((r) => ({
        id: crypto.randomUUID(),
        userId: user.id,
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
});
