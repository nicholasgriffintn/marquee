import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/marquee";

const migrationUrl = databaseUrl.replace(/[?&]sslrootcert=system/, "");

export default defineConfig({
  dialect: "postgresql",
  out: "./migrations",
  dbCredentials: {
    url: migrationUrl,
  },
});
