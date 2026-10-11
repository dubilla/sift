import { db } from "@/db";
import { asanaTasks, crewTasks, emails, emailTags, tags, todoistTasks } from "@/db/schema";
import { withAuth } from "@/lib/api/with-auth";
import {
  DEFAULT_EMAIL_LIMIT,
  DEFAULT_SINCE,
  MAX_EMAIL_LIMIT,
  parseSince,
  type EmailsReport,
  type LinkedTaskIds,
} from "@/lib/diagnostics";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Recent emails for the caller's own account — what `sift emails` reads.
 * Subject/from/snippet are omitted unless ?content=1.
 */
export const GET = withAuth(async (request, user) => {
  const params = new URL(request.url).searchParams;
  const since = params.get("since") || DEFAULT_SINCE;
  const windowMs = parseSince(since);
  if (windowMs === null) {
    return NextResponse.json(
      { error: "Invalid since; use e.g. 30m, 24h, 7d (max 30d)" },
      { status: 400 }
    );
  }

  const limitParam = params.get("limit");
  const limit = limitParam === null ? DEFAULT_EMAIL_LIMIT : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_EMAIL_LIMIT) {
    return NextResponse.json(
      { error: `Invalid limit; use an integer from 1 to ${MAX_EMAIL_LIMIT}` },
      { status: 400 }
    );
  }

  const untagged = params.get("untagged") === "1";
  const archived = params.get("archived") === "1";
  const deleted = params.get("deleted") === "1";
  const content = params.get("content") === "1";

  const to = new Date();
  const from = new Date(to.getTime() - windowMs);

  try {
    // createdAt is when Sift ingested the email (same basis as `sift health`).
    const conditions = [eq(emails.userId, user.id), gte(emails.createdAt, from)];
    if (untagged) {
      conditions.push(
        sql`not exists (select 1 from ${emailTags} where ${emailTags.emailId} = ${emails.id})`
      );
    }
    if (archived) conditions.push(isNotNull(emails.archivedAt));
    if (deleted) conditions.push(isNotNull(emails.deletedAt));

    const rows = await db
      .select({
        id: emails.id,
        externalId: emails.externalId,
        threadId: emails.threadId,
        date: emails.date,
        archivedAt: emails.archivedAt,
        deletedAt: emails.deletedAt,
        hasUnsubscribe: emails.hasUnsubscribe,
        subject: emails.subject,
        from: emails.from,
        snippet: emails.snippet,
      })
      .from(emails)
      .where(and(...conditions))
      .orderBy(desc(emails.date))
      .limit(limit);

    const ids = rows.map((row) => row.id);
    const tagsByEmail = new Map<string, string[]>();
    const tasksByEmail = new Map<string, LinkedTaskIds>();

    if (ids.length > 0) {
      const taskQuery = (table: typeof asanaTasks | typeof todoistTasks | typeof crewTasks) =>
        db
          .select({ emailId: table.emailId, id: table.id })
          .from(table)
          .where(and(eq(table.userId, user.id), inArray(table.emailId, ids)));

      const [tagRows, asanaRows, todoistRows, crewRows] = await Promise.all([
        db
          .select({ emailId: emailTags.emailId, name: tags.name })
          .from(emailTags)
          .innerJoin(tags, eq(emailTags.tagId, tags.id))
          .where(inArray(emailTags.emailId, ids)),
        taskQuery(asanaTasks),
        taskQuery(todoistTasks),
        taskQuery(crewTasks),
      ]);

      for (const row of tagRows) {
        tagsByEmail.set(row.emailId, [...(tagsByEmail.get(row.emailId) ?? []), row.name]);
      }
      for (const [provider, taskRows] of [
        ["asana", asanaRows],
        ["todoist", todoistRows],
        ["crew", crewRows],
      ] as const) {
        for (const row of taskRows) {
          if (!row.emailId) continue;
          let entry = tasksByEmail.get(row.emailId);
          if (!entry) {
            entry = { asana: [], todoist: [], crew: [] };
            tasksByEmail.set(row.emailId, entry);
          }
          entry[provider].push(row.id);
        }
      }
    }

    const report: EmailsReport = {
      window: { since, from: from.toISOString(), to: to.toISOString() },
      count: rows.length,
      emails: rows.map((row) => ({
        id: row.id,
        externalId: row.externalId,
        threadId: row.threadId,
        date: row.date.toISOString(),
        archivedAt: row.archivedAt?.toISOString() ?? null,
        deletedAt: row.deletedAt?.toISOString() ?? null,
        tags: tagsByEmail.get(row.id) ?? [],
        hasUnsubscribe: row.hasUnsubscribe ?? false,
        tasks: tasksByEmail.get(row.id) ?? { asana: [], todoist: [], crew: [] },
        ...(content ? { subject: row.subject, from: row.from, snippet: row.snippet } : {}),
      })),
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error("Error in /api/diagnostics/emails:", error);
    return NextResponse.json({ error: "Failed to list emails" }, { status: 500 });
  }
});
