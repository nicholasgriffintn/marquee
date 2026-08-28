import { Hono } from "hono";

import { hasBearerCredential } from "./auth/api-tokens.ts";
import { authRoutes } from "./auth/routes.ts";
import { CuratorSession } from "./durable/curator-session.ts";
import { consumeDeadLetters, consumeIngestion } from "./jobs/ingestion-consumer.ts";
import { scheduleIngestion } from "./jobs/ingestion-scheduler.ts";
import { automatedSyncAllowed } from "./lib/environment.ts";
import { hasTrustedOrigin } from "./lib/http.ts";
import { logError, logEvent, logRejection } from "./lib/logging.ts";
import { canonicalOrigin } from "./lib/security.ts";
import { withPageMetadata } from "./lib/share.ts";
import { adminRoutes } from "./routes/admin.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { cinemaRoutes } from "./routes/cinema.ts";
import { curatorRoutes } from "./routes/curator.ts";
import { episodeRoutes } from "./routes/episodes.ts";
import { eventRoutes } from "./routes/events.ts";
import { feedRoutes } from "./routes/feeds.ts";
import { linkRoutes } from "./routes/links.ts";
import { mcpRoutes } from "./routes/mcp.ts";
import { mediaRoutes } from "./routes/media.ts";
import { notebookRoutes } from "./routes/notebook.ts";
import { profileRoutes } from "./routes/profile.ts";
import { reelRoutes } from "./routes/reel.ts";
import { revivalRoutes } from "./routes/revival.ts";
import { sitemapRoutes } from "./routes/sitemap.ts";
import { usherRoutes } from "./routes/usher.ts";
import { apiGuard } from "./security/guard.ts";
import type { Bindings, IngestionJob } from "./types.ts";
import { CatalogSweep } from "./workflows/catalog-sweep.ts";
import { DigestWorkflow } from "./workflows/digest.ts";
import { RailsWorkflow } from "./workflows/rails.ts";

const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", async (context, next) => {
  const isNativeExchange = context.req.path === "/api/auth/native/exchange";

  if (
    context.req.method !== "GET" &&
    context.req.method !== "HEAD" &&
    !hasTrustedOrigin(context.req.raw, context.env.SITE_ORIGIN) &&
    !hasBearerCredential(context.req.raw) &&
    !isNativeExchange
  ) {
    return context.json({ error: "Cross-origin request rejected" }, 403);
  }

  await next();

  context.header("x-content-type-options", "nosniff");
  context.header("referrer-policy", "strict-origin-when-cross-origin");

  return context.res;
});

app.use("*", apiGuard);

app.get("/health", (context) => context.json({ ok: true, service: "marquee" }));

app.route("/", sitemapRoutes);

app.route("/media/reel", reelRoutes);

app.route("/media", mediaRoutes);

app.route("/api/admin", adminRoutes);

app.route("/api/catalog", catalogRoutes);

app.route("/api/cinema", cinemaRoutes);

app.route("/api/auth", authRoutes);

app.route("/api/profile", profileRoutes);

app.route("/api/episodes", episodeRoutes);

app.route("/api/curator", curatorRoutes);

app.route("/api/usher", usherRoutes);

app.route("/api/revival", revivalRoutes);

app.route("/api/notebook", notebookRoutes);

app.route("/api/links", linkRoutes);

app.route("/api/events", eventRoutes);

app.route("/feeds", feedRoutes);

app.route("/mcp", mcpRoutes);

app.notFound(async (context) => {
  if (context.req.path.startsWith("/api/")) {
    return context.json({ error: "Not found" }, 404);
  }

  const asset = await context.env.ASSETS.fetch(context.req.raw);
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const decorated = await withPageMetadata(context.env, asset, new URL(context.req.url), origin);
  const response = new Response(decorated.body, decorated);
  const scriptSource = import.meta.env.DEV ? "'self' 'unsafe-inline'" : "'self'";

  response.headers.set(
    "content-security-policy",
    `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src ${scriptSource}; img-src 'self' data: https://image.tmdb.org https://www.themoviedb.org https://avatars.githubusercontent.com https://i.ytimg.com https://archive.org https://tile.loc.gov https://api.europeana.eu; media-src 'self' blob: https://archive.org https://*.archive.org https://tile.loc.gov; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; worker-src 'self' blob:; form-action 'self'`,
  );
  response.headers.set(
    "permissions-policy",
    [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      'autoplay=(self "https://www.youtube-nocookie.com" "https://www.youtube.com")',
      'fullscreen=(self "https://www.youtube-nocookie.com" "https://www.youtube.com")',
      'encrypted-media=(self "https://www.youtube-nocookie.com" "https://www.youtube.com")',
      'picture-in-picture=(self "https://www.youtube-nocookie.com" "https://www.youtube.com")',
    ].join(", "),
  );
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-content-type-options", "nosniff");

  return response;
});

app.onError((error, context) => {
  logError("unhandled_request_error", error, {
    method: context.req.method,
    path: context.req.path,
  });

  return context.json({ error: "Unexpected server error" }, 500);
});

export { CatalogSweep, CuratorSession, DigestWorkflow, RailsWorkflow };

export default {
  fetch: app.fetch,
  scheduled(controller, env, context) {
    if (!automatedSyncAllowed(env)) {
      logEvent("scheduled_skipped_local_dev", { cron: controller.cron });

      return;
    }

    context.waitUntil(
      logRejection(scheduleIngestion(env, controller.cron), "scheduled_run_failed", {
        cron: controller.cron,
      }),
    );
  },
  queue(batch, env, context) {
    context.waitUntil(
      logRejection(
        batch.queue === "marquee-ingestion-dead-letter"
          ? consumeDeadLetters(batch, env)
          : consumeIngestion(batch, env),
        "queue_batch_failed",
        { queue: batch.queue, batchSize: batch.messages.length },
      ),
    );
  },
} satisfies ExportedHandler<Bindings, IngestionJob>;
