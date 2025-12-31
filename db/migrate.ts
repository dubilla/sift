import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config } from "dotenv";

// Load environment-specific .env file
// Priority: explicit dotenv-cli > NODE_ENV-based > .env.local (default)
if (!process.env.POSTGRES_URL) {
  const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.local";
  config({ path: envFile });
}

const runMigrations = async () => {
  const connectionString = process.env.POSTGRES_URL!;

  if (!connectionString) {
    throw new Error("POSTGRES_URL environment variable is not set");
  }

  // Show which database we're connecting to (mask password)
  const maskedUrl = connectionString.replace(/:[^:@]+@/, ':****@');
  console.log("Connecting to:", maskedUrl);
  console.log("Running migrations...");

  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  await migrate(db, { migrationsFolder: "./db/migrations" });

  await migrationClient.end();

  console.log("Migrations completed successfully!");
};

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
