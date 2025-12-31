import type { Config } from "drizzle-kit";
import { config } from "dotenv";

// Load environment-specific .env file
// Priority: explicit dotenv-cli > NODE_ENV-based > .env.local (default)
if (!process.env.POSTGRES_URL) {
  const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.local";
  config({ path: envFile });
}

export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
} satisfies Config;
