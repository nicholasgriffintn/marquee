import { Hono } from "hono";

import { authRoutes } from "./auth/routes.ts";
import { consumeDeadLetters, consumeIngestion } from "./jobs/ingestion-consumer.ts";
import { scheduleIngestion } from "./jobs/ingestion-scheduler.ts";
import { hasTrustedOrigin } from "./lib/http.ts";
import { canonicalOrigin } from "./lib/security.ts";
import { withShareCard } from "./lib/share.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { curatorRoutes } from "./routes/curator.ts";
import { linkRoutes } from "./routes/links.ts";
import { mcpRoutes } from "./routes/mcp.ts";
import { mediaRoutes } from "./routes/media.ts";
import { profileRoutes } from "./routes/profile.ts";
import type { Bindings, IngestionJob } from "./types.ts";
import { CatalogSweep } from "./workflows/catalog-sweep.ts";
import { DigestWorkflow } from "./workflows/digest.ts";
import { RailsWorkflow } from "./workflows/rails.ts";

const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", async (context, next) => {
  if (
    context.req.method !== "GET" &&
    context.req.method !== "HEAD" &&
    !hasTrustedOrigin(context.req.raw, context.env.SITE_ORIGIN)
  ) {
    return context.json({ error: "Cross-origin request rejected" }, 403);
  }

  await next();

  context.header("x-content-type-options", "nosniff");
  context.header("referrer-policy", "strict-origin-when-cross-origin");

  return context.res;
});

app.get("/health", (context) => context.json({ ok: true, service: "marquee" }));

app.route("/media", mediaRoutes);

app.route("/api/catalog", catalogRoutes);

app.route("/api/auth", authRoutes);

app.route("/api/profile", profileRoutes);

app.route("/api/curator", curatorRoutes);

app.route("/api/links", linkRoutes);

app.route("/mcp", mcpRoutes);

app.notFound(async (context) => {
  if (context.req.path.startsWith("/api/")) {
    return context.json({ error: "Not found" }, 404);
  }

  const asset = await context.env.ASSETS.fetch(context.req.raw);
  const decorated = await withShareCard(
    context.env,
    asset,
    context.req.path,
    canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN),
  );
  const response = new Response(decorated.body, decorated);
  const scriptSource = import.meta.env.DEV ? "'self' 'unsafe-inline'" : "'self'";

  response.headers.set(
    "content-security-policy",
    `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src ${scriptSource}; img-src 'self' data: https://image.tmdb.org https://www.themoviedb.org https://avatars.githubusercontent.com; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  );
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-content-type-options", "nosniff");

  return response;
});

app.onError((error, context) => {
  console.error(JSON.stringify({ event: "unhandled_request_error", detail: error.message }));

  return context.json({ error: "Unexpected server error" }, 500);
});

export { CatalogSweep, DigestWorkflow, RailsWorkflow };

export default {
  fetch: app.fetch,
  scheduled(controller, env, context) {
    context.waitUntil(scheduleIngestion(env, controller.cron));
  },
  queue(batch, env, context) {
    context.waitUntil(
      batch.queue === "marquee-ingestion-dead-letter"
        ? consumeDeadLetters(batch, env)
        : consumeIngestion(batch, env),
    );
  },
} satisfies ExportedHandler<Bindings, IngestionJob>;
