import { db } from "@/db";
import { emails, emailTags, tags } from "@/db/schema";
import { classifyEmail, CONFIDENCE_THRESHOLD } from "@/lib/services/classifier";
import { and, desc, eq, inArray, isNull, notExists } from "drizzle-orm";

const CONCURRENCY = 5;
const BACKLOG_BATCH_SIZE = 25;

export async function classifyEmailsBatch(
  userId: string,
  emailIds: string[]
): Promise<{ classified: number; total: number }> {
  if (emailIds.length === 0) return { classified: 0, total: 0 };

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.warn("classifyEmailsBatch: OPENAI_API_KEY not set, skipping");
    return { classified: 0, total: emailIds.length };
  }

  const toClassify = await db
    .select()
    .from(emails)
    .where(and(eq(emails.userId, userId), inArray(emails.id, emailIds)));

  if (toClassify.length === 0) return { classified: 0, total: 0 };

  const allTags = await db.select().from(tags);
  const tagsByName = new Map(allTags.map((t) => [t.name, t]));

  let classifiedCount = 0;

  const classifyOne = async (email: (typeof toClassify)[number]) => {
    try {
      const result = await classifyEmail(
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
        openaiApiKey,
        userId
      );

      // Persist every successful result, even below the threshold: readers hide
      // low-confidence tags, and the stored row marks the email as attempted so
      // backlog catch-up doesn't pay to re-classify it. Failures (null tag)
      // write nothing, so they get retried.
      if (result.tag) {
        const tag = tagsByName.get(result.tag);
        if (tag) {
          await db
            .insert(emailTags)
            .values({
              id: crypto.randomUUID(),
              emailId: email.id,
              tagId: tag.id,
              source: result.source,
              confidence: result.confidence,
            })
            .onConflictDoNothing();
          if (result.confidence >= CONFIDENCE_THRESHOLD) classifiedCount++;
        }
      }
    } catch (err) {
      console.error(`classifyEmailsBatch: failed for email ${email.id}`, err);
    }
  };

  for (let i = 0; i < toClassify.length; i += CONCURRENCY) {
    const chunk = toClassify.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(classifyOne));
  }

  return { classified: classifiedCount, total: toClassify.length };
}

/**
 * Classify the newest emails that have never been classified (no email_tags
 * row). Catches up on emails synced before auto-classification worked, or
 * whose classification call failed.
 */
export async function classifyUntaggedBacklog(
  userId: string,
  limit = BACKLOG_BATCH_SIZE
): Promise<{ classified: number; total: number }> {
  const untagged = await db
    .select({ id: emails.id })
    .from(emails)
    .where(
      and(
        eq(emails.userId, userId),
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
    .limit(limit);

  return classifyEmailsBatch(
    userId,
    untagged.map((e) => e.id)
  );
}
