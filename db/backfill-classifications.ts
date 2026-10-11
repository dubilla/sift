// One-time backfill: classify every unarchived email that has never been
// classified (no email_tags row), for every user or a single one.
//
//   npm run db:backfill-classifications:prod -- --dry-run
//   npm run db:backfill-classifications:prod -- --yes [--user <userId>] [--max <n per user>]
//
// Safe to re-run: classified emails get a row and drop out of the untagged set,
// and emails whose LLM call fails are skipped (via the cursor) and left for the
// next run or background sync.
import { config } from "dotenv";
import type { UntaggedCursor } from "@/lib/services/classify-batch";

const isProd = process.env.NODE_ENV === "production";

// Load env BEFORE importing anything that touches @/db (it reads POSTGRES_URL
// at import time). For prod, .env.production wins over anything exported in
// the shell, so a stray local POSTGRES_URL can't redirect a prod run.
if (isProd) {
  config({ path: ".env.production", override: true });
} else if (!process.env.POSTGRES_URL) {
  config({ path: ".env.local" });
}

const CHUNK_SIZE = 50;
// Below this, an all-failed chunk could just be one odd email at the tail
const MIN_CHUNK_FOR_ABORT = 5;

function parseArgs(argv: string[]) {
  const value = (name: string) => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) throw new Error(`${name} needs a value`);
    return v;
  };
  const maxArg = value("--max");
  const max = maxArg === undefined ? Infinity : Number(maxArg);
  if (!(max > 0)) throw new Error(`--max must be a positive number, got "${maxArg}"`);
  return {
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes"),
    userId: value("--user"),
    max,
  };
}

async function main() {
  const { dryRun, yes, userId, max } = parseArgs(process.argv.slice(2));

  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("POSTGRES_URL is not set");
  const provider = process.env.CLASSIFIER_PROVIDER || "openai";

  console.log("Database:", connectionString.replace(/:[^:@]+@/, ":****@"));
  console.log("Classifier provider:", provider);

  if (!dryRun) {
    if (isProd && provider !== "openai") {
      throw new Error(`Refusing to backfill prod with CLASSIFIER_PROVIDER=${provider}; unset it to use openai`);
    }
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  }

  const { db } = await import("@/db");
  const { emails, emailTags } = await import("@/db/schema");
  const { and, count, eq, isNull, notExists } = await import("drizzle-orm");
  const { classifyEmailsBatch, findUntaggedEmails } = await import("@/lib/services/classify-batch");

  try {
    const untaggedCounts = await db
      .select({ userId: emails.userId, untagged: count() })
      .from(emails)
      .where(
        and(
          userId ? eq(emails.userId, userId) : undefined,
          isNull(emails.archivedAt),
          isNull(emails.deletedAt),
          notExists(
            db.select({ emailId: emailTags.emailId }).from(emailTags).where(eq(emailTags.emailId, emails.id))
          )
        )
      )
      .groupBy(emails.userId);

    if (untaggedCounts.length === 0) {
      console.log("No untagged emails. Nothing to do.");
      return;
    }
    for (const { userId, untagged } of untaggedCounts) {
      console.log(`User ${userId}: ${untagged} untagged`);
    }
    if (dryRun) return;
    if (isProd && !yes) {
      console.log("\nThis writes to the production database. Re-run with --yes to proceed.");
      return;
    }

    for (const { userId, untagged } of untaggedCounts) {
      const target = Math.min(untagged, max);
      const totals = { classified: 0, failed: 0, total: 0 };
      let before: UntaggedCursor | undefined;

      while (totals.total < target) {
        const chunk = await findUntaggedEmails(userId, {
          limit: Math.min(CHUNK_SIZE, target - totals.total),
          before,
        });
        if (chunk.length === 0) break;
        before = chunk[chunk.length - 1];

        const result = await classifyEmailsBatch(userId, chunk.map((e) => e.id));
        totals.classified += result.classified;
        totals.failed += result.failed;
        totals.total += result.total;

        const lowConfidence = totals.total - totals.classified - totals.failed;
        console.log(
          `  ${totals.total}/${target}: ${totals.classified} classified, ` +
            `${lowConfidence} low confidence (hidden), ${totals.failed} failed`
        );

        // A whole chunk failing almost always means the LLM is down or the key
        // is bad; stop rather than burn through the backlog doing nothing.
        if (result.total >= MIN_CHUNK_FOR_ABORT && result.failed === result.total) {
          console.error("  Every email in this chunk failed; stopping. Check the LLM errors above.");
          process.exitCode = 1;
          return;
        }
      }
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
