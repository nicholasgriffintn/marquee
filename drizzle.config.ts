import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/marquee";

export default defineConfig({
  dialect: "postgresql",
  out: "./migrations",
  dbCredentials: {
    url: databaseUrl,
  },
});
