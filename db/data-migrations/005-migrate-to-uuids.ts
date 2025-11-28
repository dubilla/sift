import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Step 5: Migrate existing email IDs to UUIDs
 *
 * This data migration replaces all Gmail message IDs in the `emails.id` column
 * with UUIDs, and updates corresponding `activityLog.emailId` foreign key references.
 *
 * This completes the migration to separate internal UUIDs from external Gmail IDs.
 *
 * Run with: npx tsx db/data-migrations/005-migrate-to-uuids.ts
 * Or with production env: dotenv -e .env.production -- npx tsx db/data-migrations/005-migrate-to-uuids.ts
 */

interface EmailRecord {
  id: string;
  [key: string]: unknown;
}

async function migrateToUUIDs() {
  console.log("Starting Step 5: Migrating existing email IDs to UUIDs");

  try {
    // Get all emails that still have Gmail IDs (not UUIDs)
    // UUIDs match pattern: 8-4-4-4-12 hex characters
    const emailsToMigrate = await db.execute<EmailRecord>(
      sql`
        SELECT id
        FROM emails
        WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      `
    );

    const emailRows = Array.from(emailsToMigrate);
    console.log(`Found ${emailRows.length} emails to migrate`);

    if (emailRows.length === 0) {
      console.log("✅ No emails to migrate - all IDs are already UUIDs");
      return;
    }

    // Process in batches to avoid locking entire table
    const BATCH_SIZE = 100;
    let migrated = 0;

    for (let i = 0; i < emailRows.length; i += BATCH_SIZE) {
      const batch = emailRows.slice(i, i + BATCH_SIZE);

      // For each email in this batch, generate a UUID and update both tables
      for (const email of batch) {
        const oldId = email.id;
        const newUuid = crypto.randomUUID();

        // Use a transaction to ensure both updates succeed or fail together
        await db.execute(sql`BEGIN`);

        try {
          // Update activityLog references first
          await db.execute(
            sql`UPDATE activity_log SET email_id = ${newUuid} WHERE email_id = ${oldId}`
          );

          // Then update the email itself
          await db.execute(
            sql`UPDATE emails SET id = ${newUuid} WHERE id = ${oldId}`
          );

          await db.execute(sql`COMMIT`);

          migrated++;

          if (migrated % 50 === 0) {
            console.log(`Progress: ${migrated}/${emailRows.length} emails migrated`);
          }
        } catch (error) {
          await db.execute(sql`ROLLBACK`);
          throw error;
        }
      }
    }

    console.log(`✅ Migration complete! Migrated ${migrated} emails to UUIDs`);

    // Verify no Gmail IDs remain
    const remaining = await db.execute<{ count: string }>(
      sql`
        SELECT COUNT(*) as count
        FROM emails
        WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      `
    );

    const count = Array.from(remaining)[0]?.count || "0";
    console.log(`Verification: ${count} Gmail IDs remaining (should be 0)`);

    if (count !== "0") {
      throw new Error(`Migration incomplete: ${count} Gmail IDs still remain`);
    }

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  migrateToUUIDs()
    .then(() => {
      console.log("Data migration completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Data migration failed:", error);
      process.exit(1);
    });
}

export { migrateToUUIDs };
