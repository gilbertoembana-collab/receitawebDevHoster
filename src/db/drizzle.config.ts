import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables from .env file.
dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl || !/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
}

const dbCredentials = {
  url: databaseUrl,
  ssl: false,
};

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle", // Output directory for migrations.
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials,
  verbose: true,
});
