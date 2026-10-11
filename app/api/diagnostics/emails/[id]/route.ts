import { db } from "@/db";
import {
  activityLog,
  asanaTasks,
  classificationCorrections,
  crewTasks,
  emails,
  emailTags,
  tags,
  todoistTasks,
} from "@/db/schema";
import { withAuth } from "@/lib/api/with-auth";
import type { EmailDetail, IntegrationTaskRow } from "@/lib/diagnostics";
import { and, asc, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Everything Sift knows about one of the caller's emails — what `sift email <id>`
 * reads. `id` may be the internal id or the Gmail externalId. Lookups are scoped
 * to the caller, so another user's email is indistinguishable from a missing one.
 * Subject/from/snippet/task names are omitted unless ?content=1.
 */
export const GET = withAuth(
  async (request, user, { params }: { params: { id: string } }) => {
    const content = new URL(request.url).searchParams.get("content") === "1";

    try {
      const [email] = await db
        .select()
        .from(emails)
        .where(
          and(eq(emails.userId, user.id), or(eq(emails.id, params.id), eq(emails.externalId, params.id)))
        )
        .limit(1);

      if (!email) {
        return NextResponse.json({ error: "Email not found" }, { status: 404 });
      }

      const [tagRows, correctionRows, tagNames, activityRows, asanaRows, todoistRows, crewRows] =
        await Promise.all([
          db
            .select({
              name: tags.name,
              source: emailTags.source,
              confidence: emailTags.confidence,
              classifiedAt: emailTags.classifiedAt,
            })
            .from(emailTags)
            .innerJoin(tags, eq(emailTags.tagId, tags.id))
            .where(eq(emailTags.emailId, email.id)),
          db
            .select()
            .from(classificationCorrections)
            .where(
              and(
                eq(classificationCorrections.userId, user.id),
                eq(classificationCorrections.emailId, email.id)
              )
            )
            .orderBy(asc(classificationCorrections.correctedAt)),
          db.select({ id: tags.id, name: tags.name }).from(tags),
          db
            .select()
            .from(activityLog)
            .where(and(eq(activityLog.userId, user.id), eq(activityLog.emailId, email.id)))
            .orderBy(asc(activityLog.createdAt)),
          db
            .select()
            .from(asanaTasks)
            .where(and(eq(asanaTasks.userId, user.id), eq(asanaTasks.emailId, email.id))),
          db
            .select()
            .from(todoistTasks)
            .where(and(eq(todoistTasks.userId, user.id), eq(todoistTasks.emailId, email.id))),
          db
            .select()
            .from(crewTasks)
            .where(and(eq(crewTasks.userId, user.id), eq(crewTasks.emailId, email.id))),
        ]);

      const tagName = new Map(tagNames.map((tag) => [tag.id, tag.name]));
      const task = (
        provider: IntegrationTaskRow["provider"],
        row: { id: string; createdAt: Date; taskName: string },
        taskId: string,
        url: string | null
      ): IntegrationTaskRow => ({
        provider,
        id: row.id,
        taskId,
        url,
        createdAt: row.createdAt.toISOString(),
        ...(content ? { taskName: row.taskName } : {}),
      });

      const detail: EmailDetail = {
        email: {
          id: email.id,
          externalId: email.externalId,
          threadId: email.threadId,
          date: email.date.toISOString(),
          createdAt: email.createdAt.toISOString(),
          archivedAt: email.archivedAt?.toISOString() ?? null,
          deletedAt: email.deletedAt?.toISOString() ?? null,
          hasUnsubscribe: email.hasUnsubscribe ?? false,
          ...(content ? { subject: email.subject, from: email.from, snippet: email.snippet } : {}),
        },
        tags: tagRows.map((row) => ({
          name: row.name,
          source: row.source,
          confidence: row.confidence,
          classifiedAt: row.classifiedAt.toISOString(),
        })),
        corrections: correctionRows.map((row) => ({
          id: row.id,
          oldTag: row.oldTagId ? (tagName.get(row.oldTagId) ?? row.oldTagId) : null,
          newTag: tagName.get(row.newTagId) ?? row.newTagId,
          oldSource: row.oldSource,
          oldConfidence: row.oldConfidence,
          correctedAt: row.correctedAt.toISOString(),
          appliedToSimilar: row.appliedToSimilar ?? false,
        })),
        activity: activityRows.map((row) => ({
          id: row.id,
          action: row.action,
          createdAt: row.createdAt.toISOString(),
        })),
        integrationTasks: [
          ...asanaRows.map((row) => task("asana", row, row.asanaTaskGid, row.asanaTaskUrl)),
          ...todoistRows.map((row) => task("todoist", row, row.todoistTaskId, row.todoistTaskUrl)),
          ...crewRows.map((row) => task("crew", row, row.crewTaskId, row.crewTaskUrl)),
        ],
      };

      return NextResponse.json(detail);
    } catch (error) {
      console.error("Error in /api/diagnostics/emails/[id]:", error);
      return NextResponse.json({ error: "Failed to load email" }, { status: 500 });
    }
  }
);
