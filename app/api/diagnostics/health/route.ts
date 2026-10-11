import { db } from "@/db";
import {
  asanaTasks,
  classificationCorrections,
  crewTasks,
  emails,
  emailTags,
  todoistTasks,
  userStats,
} from "@/db/schema";
import { withAuth } from "@/lib/api/with-auth";
import { DEFAULT_SINCE, parseSince, type HealthReport } from "@/lib/diagnostics";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Sync is expected to run at least this often; older means it has stalled.
const STALE_SYNC_MS = 6 * 60 * 60 * 1000;

/**
 * Production health for the caller's own account — what the `sift health` CLI
 * reads. Everything is scoped to the authenticated user.
 */
export const GET = withAuth(async (request, user) => {
  const since = new URL(request.url).searchParams.get("since") || DEFAULT_SINCE;
  const windowMs = parseSince(since);
  if (windowMs === null) {
    return NextResponse.json(
      { error: "Invalid since; use e.g. 30m, 24h, 7d (max 30d)" },
      { status: 400 }
    );
  }

  const to = new Date();
  const from = new Date(to.getTime() - windowMs);

  try {
    const taskCount = (table: typeof asanaTasks | typeof todoistTasks | typeof crewTasks) =>
      db
        .select({ count: count() })
        .from(table)
        .where(and(eq(table.userId, user.id), gte(table.createdAt, from)));

    const [statsRows, emailRows, correctionRows, asanaRows, todoistRows, crewRows] =
      await Promise.all([
        db
          .select({ lastSyncedAt: userStats.lastSyncedAt })
          .from(userStats)
          .where(eq(userStats.userId, user.id)),
        // createdAt is when Sift ingested the email (date is when it was sent).
        db
          .select({
            ingested: count(),
            tagged: sql<number>`count(*) filter (where exists (select 1 from ${emailTags} where ${emailTags.emailId} = ${emails.id}))`.mapWith(
              Number
            ),
          })
          .from(emails)
          .where(and(eq(emails.userId, user.id), gte(emails.createdAt, from))),
        db
          .select({ count: count() })
          .from(classificationCorrections)
          .where(
            and(
              eq(classificationCorrections.userId, user.id),
              gte(classificationCorrections.correctedAt, from)
            )
          ),
        taskCount(asanaTasks),
        taskCount(todoistTasks),
        taskCount(crewTasks),
      ]);

    const lastSyncedAt = statsRows[0]?.lastSyncedAt ?? null;
    const ingested = emailRows[0]?.ingested ?? 0;
    const tagged = emailRows[0]?.tagged ?? 0;

    const warnings: string[] = [];
    if (!lastSyncedAt) {
      warnings.push("No sync has ever completed for this account.");
    } else if (to.getTime() - lastSyncedAt.getTime() > STALE_SYNC_MS) {
      warnings.push(`Last sync was more than ${STALE_SYNC_MS / 3600000}h ago.`);
    }
    if (ingested > 0 && tagged === 0) {
      warnings.push(
        `${ingested} emails ingested in the last ${since} but none were tagged — classification may not be writing tags.`
      );
    }

    const report: HealthReport = {
      window: { since, from: from.toISOString(), to: to.toISOString() },
      user_stats: { last_synced_at: lastSyncedAt?.toISOString() ?? null },
      emails: { ingested, tagged, untagged: ingested - tagged },
      classification_corrections: correctionRows[0]?.count ?? 0,
      integration_tasks: {
        asana: asanaRows[0]?.count ?? 0,
        todoist: todoistRows[0]?.count ?? 0,
        crew: crewRows[0]?.count ?? 0,
      },
      warnings,
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error("Error in /api/diagnostics/health:", error);
    return NextResponse.json({ error: "Failed to compute health" }, { status: 500 });
  }
});
