import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Step 2: Copy existing id values to externalId
 *
 * This data migration copies all Gmail message IDs from the `id` column
 * to the new `externalId` column. This prepares for Step 5 where we'll
 * replace `id` with internal UUIDs.
 *
 * Safe to run multiple times (idempotent).
 */
async function copyIdToExternalId() {
  console.log("Starting data migration: Copy id → externalId");

  try {
    const result = await db.execute(
      sql`UPDATE emails SET external_id = id WHERE external_id IS NULL`
    );

    console.log(`✅ Migration complete. Rows updated: ${result.length}`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  copyIdToExternalId()
    .then(() => {
      console.log("Data migration completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Data migration failed:", error);
      process.exit(1);
    });
}

export { copyIdToExternalId };
