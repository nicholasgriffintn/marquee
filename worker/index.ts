import { Hono } from "hono";

import { hasBearerCredential } from "./auth/api-tokens.ts";
import { authRoutes } from "./auth/routes.ts";
import { openDatabase, withDatabase } from "./database/runtime.ts";
import { CuratorSession } from "./durable/curator-session.ts";
import { Screening } from "./durable/screening.ts";
import { consumeDeadLetters, consumeIngestion } from "./jobs/ingestion-consumer.ts";
import { scheduleIngestion } from "./jobs/ingestion-scheduler.ts";
import { consumeRailRefresh, consumeRailRefreshDeadLetters } from "./jobs/rail-refresh-consumer.ts";
import { automatedSyncAllowed } from "./lib/environment.ts";
import { hasTrustedOrigin } from "./lib/http.ts";
import { logError, logEvent, logRejection } from "./lib/logging.ts";
import { canonicalOrigin } from "./lib/security.ts";
import { withPageMetadata } from "./lib/share.ts";
import { flushUpstreamUsage } from "./lib/upstream-usage.ts";
import { adminRoutes } from "./routes/admin.ts";
import { aliasRoutes } from "./routes/aliases.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { cinemaRoutes } from "./routes/cinema.ts";
import { curatorRoutes } from "./routes/curator.ts";
import { editionRoutes } from "./routes/editions.ts";
import { episodeRoutes } from "./routes/episodes.ts";
import { eventRoutes } from "./routes/events.ts";
import { feedRoutes } from "./routes/feeds.ts";
import { importRoutes } from "./routes/imports.ts";
import { linkRoutes } from "./routes/links.ts";
import { mcpRoutes } from "./routes/mcp.ts";
import { mediaRoutes } from "./routes/media.ts";
import { notebookRoutes } from "./routes/notebook.ts";
import { pageMetadataRoutes } from "./routes/page-metadata.ts";
import { profileRoutes } from "./routes/profile.ts";
import { reelRoutes } from "./routes/reel.ts";
import { revivalRoutes } from "./routes/revival.ts";
import { screeningRoutes } from "./routes/screenings.ts";
import { sitemapRoutes } from "./routes/sitemap.ts";
import { usherRoutes } from "./routes/usher.ts";
import { bearerScopeGuard } from "./security/bearer-scopes.ts";
import { apiGuard } from "./security/guard.ts";
import type { Bindings, QueueJob, WorkerBindings } from "./types.ts";
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

app.use("/api/*", bearerScopeGuard);

app.get("/health", async (context) => {
  context.header("cache-control", "no-store");

  const database = await context.env.DB.first<{ ok: number }>("SELECT 1 AS ok").then(
    () => true,
    (error: unknown) => {
      logError("health_database_unreachable", error);

      return false;
    },
  );

  return context.json(
    { ok: database, service: "marquee", database: database ? "up" : "down" },
    database ? 200 : 503,
  );
});

app.route("/", sitemapRoutes);

app.route("/", aliasRoutes);

app.route("/media/reel", reelRoutes);

app.route("/media", mediaRoutes);

app.route("/api/admin", adminRoutes);

app.route("/api/catalog", catalogRoutes);

app.route("/api/cinema", cinemaRoutes);

app.route("/api/auth", authRoutes);

app.route("/api/profile/imports", importRoutes);

app.route("/api/profile", profileRoutes);

app.route("/api/episodes", episodeRoutes);

app.route("/api/curator", curatorRoutes);

app.route("/api/editions", editionRoutes);

app.route("/api/usher", usherRoutes);

app.route("/api/revival", revivalRoutes);

app.route("/api/notebook", notebookRoutes);

app.route("/api/links", linkRoutes);

app.route("/api/events", eventRoutes);

app.route("/api/page-metadata", pageMetadataRoutes);

app.route("/api/screenings", screeningRoutes);

app.route("/feeds", feedRoutes);

app.route("/mcp", mcpRoutes);

app.notFound(async (context) => {
  if (context.req.path.startsWith("/api/")) {
    return context.json({ error: "Not found" }, 404);
  }

  const shell = new Request(context.req.url, { headers: { accept: "text/html" } });
  const asset = await context.env.ASSETS.fetch(shell);
  const origin = canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN);
  const decorated = await withPageMetadata(context.env, asset, new URL(context.req.url), origin);
  const response = new Response(decorated.body, decorated);
  const scriptSource = import.meta.env.DEV
    ? "'self' 'unsafe-inline'"
    : "'self' https://static.cloudflareinsights.com";

  response.headers.set(
    "content-security-policy",
    `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src ${scriptSource}; img-src 'self' data: https://image.tmdb.org https://www.themoviedb.org https://avatars.githubusercontent.com https://i.ytimg.com https://archive.org https://tile.loc.gov https://api.europeana.eu; media-src 'self' blob: https://archive.org https://*.archive.org https://tile.loc.gov; connect-src 'self' https://cloudflareinsights.com; base-uri 'none'; frame-ancestors 'none'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; worker-src 'self' blob:; form-action 'self'`,
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

  if ((response.headers.get("content-type") ?? "").includes("text/html")) {
    response.headers.delete("etag");
    response.headers.delete("content-length");
    response.headers.set("cache-control", "public, max-age=0, must-revalidate");
  }

  return response;
});

app.onError((error, context) => {
  logError("unhandled_request_error", error, {
    method: context.req.method,
    path: context.req.path,
  });

  return context.json({ error: "Unexpected server error" }, 500);
});

export { CatalogSweep, CuratorSession, DigestWorkflow, RailsWorkflow, Screening };

export default {
  async fetch(request, env, context) {
    const { database, deferred, runtime } = openDatabase(env);

    try {
      return await app.fetch(request, runtime, context);
    } finally {
      context.waitUntil(
        Promise.allSettled(deferred)
          .then(() => logRejection(flushUpstreamUsage(runtime), "upstream_usage_flush_failed"))
          .then(() => database.close()),
      );
    }
  },
  scheduled(controller, env, context) {
    if (!automatedSyncAllowed(env)) {
      logEvent("scheduled_skipped_local_dev", { cron: controller.cron });

      return;
    }

    context.waitUntil(
      logRejection(
        withDatabase(env, (runtime) => scheduleIngestion(runtime, controller.cron)),
        "scheduled_run_failed",
        { cron: controller.cron },
      ),
    );
  },
  queue(batch, env, context) {
    context.waitUntil(
      logRejection(
        withDatabase(env, (runtime) =>
          batch.queue === "marquee-rail-refresh"
            ? consumeRailRefresh(batch, runtime)
            : batch.queue === "marquee-rail-refresh-dead-letter"
              ? consumeRailRefreshDeadLetters(batch)
              : batch.queue === "marquee-ingestion-dead-letter"
                ? consumeDeadLetters(batch, runtime)
                : consumeIngestion(batch, runtime),
        ),
        "queue_batch_failed",
        { queue: batch.queue, batchSize: batch.messages.length },
      ),
    );
  },
} satisfies ExportedHandler<WorkerBindings, QueueJob>;
