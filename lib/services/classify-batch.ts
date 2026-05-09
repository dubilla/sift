import { db } from "@/db";
import { emails, emailTags, tags } from "@/db/schema";
import { classifyEmail, CONFIDENCE_THRESHOLD } from "@/lib/services/classifier";
import { and, eq, inArray } from "drizzle-orm";

const CONCURRENCY = 5;

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

      if (result.tag && result.confidence >= CONFIDENCE_THRESHOLD) {
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
          classifiedCount++;
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
