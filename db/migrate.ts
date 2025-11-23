import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const runMigrations = async () => {
  const connectionString = process.env.POSTGRES_URL!;

  if (!connectionString) {
    throw new Error("POSTGRES_URL environment variable is not set");
  }

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
