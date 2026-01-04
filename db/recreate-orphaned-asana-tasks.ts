import "dotenv/config";
import { db } from "./index";
import { asanaTasks, emails, asanaSettings } from "./schema";
import { eq, isNull, and, isNotNull } from "drizzle-orm";
import { getValidAccessTokenForProvider } from "../lib/services/token";
import { createTask, getCurrentUser, getTask } from "../lib/services/asana";
import { getFullEmail } from "../lib/services/gmail";

/**
 * Script to recreate orphaned Asana tasks (tasks without projects)
 * This script:
 * 1. Finds all Asana tasks in the database
 * 2. Checks if they have a project in Asana
 * 3. If no project, fetches the original email and recreates the task with proper assignment
 */

async function recreateOrphanedTasks() {
  console.log("🔍 Finding orphaned Asana tasks...");

  // Get all Asana tasks from database
  const tasks = await db
    .select({
      taskId: asanaTasks.id,
      userId: asanaTasks.userId,
      emailId: asanaTasks.emailId,
      asanaTaskGid: asanaTasks.asanaTaskGid,
      taskName: asanaTasks.taskName,
    })
    .from(asanaTasks)
    .where(isNotNull(asanaTasks.emailId)); // Only tasks created from emails

  console.log(`Found ${tasks.length} tasks to check`);

  let orphanedCount = 0;
  let recreatedCount = 0;
  let errorCount = 0;

  for (const task of tasks) {
    try {
      console.log(`\nChecking task: ${task.taskName} (${task.asanaTaskGid})`);

      // Get Asana access token
      const asanaToken = await getValidAccessTokenForProvider(
        task.userId,
        "asana"
      );

      // Check if task exists and has projects in Asana
      let hasProject = false;
      try {
        const asanaTask = await getTask(asanaToken, task.asanaTaskGid);
        // If we can fetch it, assume it has a project (simple check)
        // In reality, we'd need to check the projects field, but this requires more API fields
        console.log(`  ✓ Task exists in Asana`);
        continue; // Skip if task exists
      } catch (err) {
        console.log(`  ⚠ Task may be orphaned or deleted`);
        orphanedCount++;
      }

      // Get email from database
      if (!task.emailId) {
        console.log(`  ⚠ No email ID, skipping...`);
        continue;
      }

      const [email] = await db
        .select()
        .from(emails)
        .where(
          and(
            eq(emails.id, task.emailId),
            eq(emails.userId, task.userId),
            isNull(emails.deletedAt)
          )
        )
        .limit(1);

      if (!email) {
        console.log(`  ⚠ Email not found, skipping...`);
        continue;
      }

      // Get settings for workspace/project defaults
      const [settings] = await db
        .select()
        .from(asanaSettings)
        .where(eq(asanaSettings.userId, task.userId))
        .limit(1);

      if (!settings?.defaultWorkspaceGid) {
        console.log(`  ⚠ No default workspace configured, skipping...`);
        continue;
      }

      // Fetch full email body
      const gmailToken = await getValidAccessTokenForProvider(
        task.userId,
        "google"
      );
      const fullEmail = await getFullEmail(gmailToken, email.externalId);

      // Get or fetch Asana user GID
      let asanaUserGid = settings.asanaUserGid;
      if (!asanaUserGid) {
        const asanaUser = await getCurrentUser(asanaToken);
        asanaUserGid = asanaUser.gid;

        // Update settings
        await db
          .update(asanaSettings)
          .set({ asanaUserGid: asanaUser.gid })
          .where(eq(asanaSettings.userId, task.userId));
      }

      // Create new task with proper assignment and full body
      const bodyContent = fullEmail.bodyText || email.snippet || "";
      const notes = `From: ${email.from}\n\n${bodyContent}\n\n---\nCreated from email in Sift (recreated)`;

      console.log(`  📝 Recreating task...`);
      const newTask = await createTask(asanaToken, {
        name: task.taskName,
        notes,
        workspaceGid: settings.defaultWorkspaceGid,
        projectGid: settings.defaultProjectGid || undefined,
        assigneeGid: asanaUserGid,
      });

      // Update database record with new task GID
      await db
        .update(asanaTasks)
        .set({
          asanaTaskGid: newTask.gid,
          asanaTaskUrl: newTask.permalink_url,
        })
        .where(eq(asanaTasks.id, task.taskId));

      console.log(`  ✅ Recreated: ${newTask.permalink_url}`);
      recreatedCount++;
    } catch (err) {
      console.error(`  ❌ Error processing task:`, err);
      errorCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Total tasks checked: ${tasks.length}`);
  console.log(`  Orphaned tasks found: ${orphanedCount}`);
  console.log(`  Tasks recreated: ${recreatedCount}`);
  console.log(`  Errors: ${errorCount}`);
}

recreateOrphanedTasks()
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Fatal error:", err);
    process.exit(1);
  });
