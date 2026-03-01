import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "dotenv";
import { tags } from "./schema";

config({ path: ".env.local" });

const initialTags = [
  {
    id: crypto.randomUUID(),
    name: "archivable",
    displayName: "Archive",
    description: "Safe to archive without reading - newsletters, notifications, marketing",
    color: "gray",
    icon: "📦",
    sortOrder: 1,
  },
  {
    id: crypto.randomUUID(),
    name: "quick_action",
    displayName: "Quick Action",
    description: "Needs brief response, RSVP, or simple confirmation",
    color: "blue",
    icon: "⚡",
    sortOrder: 2,
  },
  {
    id: crypto.randomUUID(),
    name: "asana_task",
    displayName: "Create Task",
    description: "Represents work to do - requests, assignments, follow-ups",
    color: "orange",
    icon: "📋",
    sortOrder: 3,
  },
  {
    id: crypto.randomUUID(),
    name: "unsubscribable",
    displayName: "Unsubscribe",
    description: "Unwanted marketing or spam - should unsubscribe",
    color: "red",
    icon: "🗑️",
    sortOrder: 4,
  },
  {
    id: crypto.randomUUID(),
    name: "send_to_reader",
    displayName: "Send to Reader",
    description: "Contains a link worth reading later - save to Readwise Reader",
    color: "yellow",
    icon: "📖",
    sortOrder: 5,
  },
];

const seedTags = async () => {
  const connectionString = process.env.POSTGRES_URL!;

  if (!connectionString) {
    throw new Error("POSTGRES_URL environment variable is not set");
  }

  console.log("Seeding tags...");

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  for (const tag of initialTags) {
    await db
      .insert(tags)
      .values(tag)
      .onConflictDoNothing({ target: tags.name });
    console.log(`  ✓ ${tag.name} (${tag.icon} ${tag.displayName})`);
  }

  await client.end();

  console.log("\nTags seeded successfully!");
};

seedTags().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
