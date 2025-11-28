// IMPORTANT: Load environment variables BEFORE any other imports
// because db/index.ts needs POSTGRES_URL to be defined
import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { emails, accounts } from "@/db/schema";
import { eq, isNull, or } from "drizzle-orm";
import { getGmailClient, parseListUnsubscribe } from "@/lib/services/gmail";

// Create db connection after env vars are loaded
const connectionString = process.env.POSTGRES_URL!;
const client = postgres(connectionString);
const db = drizzle(client);

// Local version of getValidAccessToken that uses our db connection
async function getValidAccessToken(userId: string): Promise<string> {
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);

  if (!userAccounts.length) {
    throw new Error("No account found for user");
  }

  const account = userAccounts[0];

  if (!account.access_token) {
    throw new Error("No access token found");
  }

  // Check if token is expired (or will expire in next 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = account.expires_at || 0;
  const needsRefresh = expiresAt < now + 300;

  if (!needsRefresh) {
    return account.access_token;
  }

  // Token is expired, refresh it
  if (!account.refresh_token) {
    throw new Error("No refresh token available");
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh token: ${await response.text()}`);
    }

    const tokens: any = await response.json();
    const newExpiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

    await db
      .update(accounts)
      .set({
        access_token: tokens.access_token,
        expires_at: newExpiresAt,
      })
      .where(eq(accounts.userId, userId));

    return tokens.access_token;
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return account.access_token;
  }
}

interface EmailToBackfill {
  id: string; // Internal UUID
  externalId: string; // Gmail message ID
  userId: string;
}

async function backfillUnsubscribeData() {
  console.log("🔄 Starting unsubscribe data backfill...\n");
  console.log("🔍 Database URL:", process.env.POSTGRES_URL);
  console.log();

  try {
    // Get all emails that don't have unsubscribe data
    console.log("📊 Fetching emails that need backfilling...");
    const emailsToBackfill = await db
      .select({
        id: emails.id, // Internal UUID
        externalId: emails.externalId, // Gmail message ID
        userId: emails.userId,
      })
      .from(emails)
      .where(
        or(
          eq(emails.hasUnsubscribe, false),
          isNull(emails.hasUnsubscribe)
        )
      );

    console.log(`   Found ${emailsToBackfill.length} emails to process\n`);

    if (emailsToBackfill.length === 0) {
      console.log("✅ No emails need backfilling!");
      return;
    }

    // Group emails by userId
    const emailsByUser = new Map<string, EmailToBackfill[]>();
    for (const email of emailsToBackfill) {
      if (!emailsByUser.has(email.userId)) {
        emailsByUser.set(email.userId, []);
      }
      emailsByUser.get(email.userId)!.push(email);
    }

    console.log(`👥 Processing emails for ${emailsByUser.size} user(s)\n`);

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    // Process each user's emails
    for (const [userId, userEmails] of Array.from(emailsByUser)) {
      console.log(`\n👤 Processing ${userEmails.length} emails for user ${userId.slice(0, 8)}...`);

      try {
        // Get valid access token for this user
        const accessToken = await getValidAccessToken(userId);
        const gmail = await getGmailClient(accessToken);

        // Process emails in batches to avoid rate limits
        const batchSize = 10;
        for (let i = 0; i < userEmails.length; i += batchSize) {
          const batch = userEmails.slice(i, i + batchSize);

          await Promise.all(
            batch.map(async (email: EmailToBackfill) => {
              try {
                // Fetch email metadata with List-Unsubscribe header
                const emailData = await gmail.users.messages.get({
                  userId: "me",
                  id: email.externalId,
                  format: "metadata",
                  metadataHeaders: ["List-Unsubscribe"],
                });

                const headers = emailData.data.payload?.headers || [];
                const listUnsubscribeHeader = headers.find(
                  (h) => h.name === "List-Unsubscribe"
                )?.value || "";

                // Parse the header
                const unsubscribeData = parseListUnsubscribe(listUnsubscribeHeader);

                // Update the database
                await db
                  .update(emails)
                  .set({
                    hasUnsubscribe: unsubscribeData.hasUnsubscribe,
                    unsubscribeUrl: unsubscribeData.url,
                  })
                  .where(eq(emails.id, email.id));

                totalProcessed++;
                if (unsubscribeData.hasUnsubscribe) {
                  totalUpdated++;
                }

                // Progress indicator
                if (totalProcessed % 50 === 0) {
                  console.log(`   Progress: ${totalProcessed}/${emailsToBackfill.length} (${totalUpdated} with unsubscribe)`);
                }
              } catch (error) {
                totalErrors++;
                console.error(`   ❌ Error processing email ${email.externalId}:`, error);
              }
            })
          );

          // Small delay between batches to respect rate limits
          if (i + batchSize < userEmails.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        console.log(`   ✅ Completed user ${userId.slice(0, 8)}`);
      } catch (error) {
        console.error(`   ❌ Error processing user ${userId}:`, error);
        totalErrors += userEmails.length;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📈 Backfill Summary:");
    console.log(`   Total emails processed: ${totalProcessed}`);
    console.log(`   Emails with unsubscribe: ${totalUpdated}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log("=".repeat(60));
    console.log("\n✅ Backfill completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Backfill failed:", error);
    await client.end();
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the backfill
backfillUnsubscribeData().catch((err) => {
  console.error("Backfill script error:", err);
  process.exit(1);
});
