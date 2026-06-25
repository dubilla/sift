import { getCurrentSession } from "@/lib/mobile-auth";
import { db } from "@/db";
import { emails, emailTags, tags } from "@/db/schema";
import { classifyEmail, CONFIDENCE_THRESHOLD } from "@/lib/services/classifier";
import { eq, and, isNull, inArray, desc, sql, notExists } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), { status: 500 });
    }

    const body = await request.json();
    const { emailIds, limit = 50, classifyAll = false } = body;

    // Get emails to classify
    let emailsToClassify;

    if (emailIds && Array.isArray(emailIds) && emailIds.length > 0) {
      emailsToClassify = await db
        .select()
        .from(emails)
        .where(
          and(
            eq(emails.userId, session.user.id),
            inArray(emails.id, emailIds)
          )
        )
        .limit(limit);
    } else {
      emailsToClassify = await db
        .select()
        .from(emails)
        .where(
          and(
            eq(emails.userId, session.user.id),
            isNull(emails.archivedAt),
            isNull(emails.deletedAt),
            notExists(
              db
                .select({ emailId: emailTags.emailId })
                .from(emailTags)
                .where(eq(emailTags.emailId, emails.id))
            )
          )
        )
        .orderBy(desc(emails.date))
        .limit(classifyAll ? 10000 : limit);
    }

    const allTags = await db.select().from(tags);
    const tagsByName = new Map(allTags.map((t) => [t.name, t]));

    const encoder = new TextEncoder();
    const userId = session.user.id;
    const total = emailsToClassify.length;

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (data: object) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        };

        if (total === 0) {
          enqueue({ type: "done", classified: 0, total: 0 });
          controller.close();
          return;
        }

        enqueue({ type: "start", total });

        let classifiedCount = 0;

        for (const email of emailsToClassify) {
          try {
            const classification = await classifyEmail(
              {
                id: email.id,
                subject: email.subject,
                from: email.from,
                to: email.to,
                snippet: email.snippet,
                hasUnsubscribe: email.hasUnsubscribe || false,
                listId: email.listId,
                isNoreply: email.isNoreply || false,
                recipientCount: email.recipientCount || 1,
              },
              OPENAI_API_KEY!,
              userId
            );

            if (classification.tag && classification.confidence >= CONFIDENCE_THRESHOLD) {
              const tag = tagsByName.get(classification.tag);

              if (tag) {
                await db
                  .insert(emailTags)
                  .values({
                    id: crypto.randomUUID(),
                    emailId: email.id,
                    tagId: tag.id,
                    source: classification.source,
                    confidence: classification.confidence,
                  })
                  .onConflictDoNothing();

                classifiedCount++;
              }
            }

            enqueue({
              type: "progress",
              classified: classifiedCount,
              total,
              emailId: email.id,
              tag: classification.tag,
              confidence: classification.confidence,
            });
          } catch (err) {
            // Skip individual email errors, keep processing
            enqueue({
              type: "progress",
              classified: classifiedCount,
              total,
              emailId: email.id,
              tag: null,
              confidence: 0,
            });
          }
        }

        enqueue({ type: "done", classified: classifiedCount, total });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Error in /api/emails/classify:", error);
    return new Response(JSON.stringify({ error: "Failed to classify emails" }), { status: 500 });
  }
}

// GET: Get classification stats
export async function GET(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const allTags = await db.select().from(tags);

    const tagCountResults = await db
      .select({ tagId: emailTags.tagId, count: sql<number>`count(*)` })
      .from(emailTags)
      .innerJoin(emails, eq(emailTags.emailId, emails.id))
      .where(
        and(
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      )
      .groupBy(emailTags.tagId);

    const tagCountById = new Map(tagCountResults.map((r) => [r.tagId, Number(r.count)]));
    const tagCounts: Record<string, number> = {};
    for (const tag of allTags) {
      tagCounts[tag.name] = tagCountById.get(tag.id) ?? 0;
    }

    const allEmailIds = await db
      .select({ id: emails.id })
      .from(emails)
      .where(
        and(
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      );

    const classifiedEmailIds = await db
      .select({ emailId: emailTags.emailId })
      .from(emailTags)
      .innerJoin(emails, eq(emailTags.emailId, emails.id))
      .where(eq(emails.userId, session.user.id));

    const classifiedSet = new Set(classifiedEmailIds.map((r) => r.emailId));
    const unclassified = allEmailIds.filter((e) => !classifiedSet.has(e.id)).length;

    return new Response(
      JSON.stringify({
        tags: allTags.map((t) => ({
          id: t.id,
          name: t.name,
          displayName: t.displayName,
          color: t.color,
          icon: t.icon,
          count: tagCounts[t.name] || 0,
        })),
        unclassified,
        total: allEmailIds.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in GET /api/emails/classify:", error);
    return new Response(JSON.stringify({ error: "Failed to get classification stats" }), { status: 500 });
  }
}
