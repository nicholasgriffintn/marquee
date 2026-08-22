# Marquee

Marquee is a streaming discovery service with live title search, provider-aware discovery, current watch destinations, Cloudflare AI recommendations, and a personal shelf with ratings and notes.

Title metadata and images come from TMDB. Streaming, rental, and purchase availability comes from JustWatch through TMDB's watch-provider API. We also use Watchmode for some additional metadata and images. User authentication is via GitHub OAuth.

Air dates come from TVmaze, anime tags from AniList, and the trending rail is ranked by Wikipedia pageview movement. A viewer can link Trakt to import their watch history, ratings and watchlist.

## How search works

Search is hybrid. An FTS5 index over titles, synopses, TMDB keywords and credited names supplies keyword precision; a Vectorize index of bge-m3 embeddings supplies meaning. The two result sets are interleaved and scored by `@cf/baai/bge-reranker-base`, with a small additive boost from a title's Wikipedia pageview trend.

The AI shelves and the curator sit on top of that rather than driving it. A viewer's taste vector is the mean of the embeddings of what they save, and each shelf is a different slice of its neighbourhood. The model only names the shelf and picks from a shortlist it can see.

## Local development

Copy `.dev.vars.example` and replace with your env variables:

```dotenv
cp .dev.vars.example .dev.vars
```

Create a GitHub OAuth app with `http://localhost:8787/api/auth/github/callback` as its local
authorisation callback URL and `https://<your-domain>/api/auth/github/callback` for your deployed domain, then put its client ID and client secret in `.dev.vars`.

Trakt is optional. Create an application at <https://trakt.tv/oauth/applications> with
`http://localhost:8787/api/links/trakt/callback` as a redirect URI, then set `TRAKT_CLIENT_ID` and
`TRAKT_CLIENT_SECRET`. Without them the Trakt panel on the Sources page reports itself as
unconfigured and everything else carries on.

Create the Vectorize index once per account:

```bash
pnpm exec wrangler vectorize create marquee-titles --dimensions=1024 --metric=cosine
```

Then start:

```bash
pnpm db:migrate:local
pnpm dev
```

Open <http://localhost:8787>

### Ingesting locally

`pnpm dev` also runs D1 and the ingestion queue locally. Cron triggers don't fire on a
timer, so hit the scheduled endpoint to queue `sync-providers` and `sync-catalog`:

```bash
curl http://localhost:8787/cdn-cgi/local/scheduled
```

The consumer picks them up within a few seconds. Check what happened:

```bash
pnpm exec wrangler d1 execute DB --local --command "SELECT job_type, status, error FROM ingestion_runs ORDER BY started_at DESC LIMIT 10"
```

## Deployment

Install dependencies, authenticate Wrangler, and create the D1 database:

```bash
pnpm install
```

Put your secrets:

```bash
pnpm exec wrangler secret put TMDB_API_TOKEN
pnpm exec wrangler secret put WATCHMODE_API_KEY
pnpm exec wrangler secret put OMDB_API_KEY
pnpm exec wrangler secret put SIMKL_CLIENT_ID
pnpm exec wrangler secret put TRAKT_CLIENT_ID
pnpm exec wrangler secret put TRAKT_CLIENT_SECRET
pnpm exec wrangler secret put CLOUDFLARE_ACCOUNT_ID
pnpm exec wrangler secret put CLOUDFLARE_API_TOKEN
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
pnpm exec wrangler secret put TRAKT_CLIENT_ID
pnpm exec wrangler secret put TRAKT_CLIENT_SECRET
```

If the
Worker is served behind a different canonical domain, set `SITE_ORIGIN` to that HTTPS origin in
`wrangler.json`.

Deploy the application and apply its remote D1 migration:

```bash
pnpm deploy
```

## Backfills

The catalogue sweep is a Workflow on a six-hourly cron. It syncs providers and the homepage
sections, fans the discover pages out over the ingestion queue, refreshes the TVmaze schedule and
the Wikipedia buzz sample, then queues enrichment and embeddings.

Keywords, credits and embeddings arrive as titles are re-hydrated from TMDB, so a fresh deployment
fills in over the first few sweeps rather than all at once. Embeddings are queued 2,000 at a time
against whatever is unembedded or has been updated since it was last embedded, so nothing is
re-embedded without reason.

A second cron on Monday mornings runs the digest workflow, which writes a per-viewer digest of
fresh releases near their taste, what is trending, and the week's episodes, readable at `/this-week`.

## Connecting an agent

Marquee speaks MCP at `/mcp` over JSON-RPC. Mint a token from the Sources page, then point a client
at it:

```json
{
  "mcpServers": {
    "marquee": {
      "url": "https://marquee.pashi.app/mcp",
      "headers": { "Authorization": "Bearer mq_your_token" }
    }
  }
}
```

It exposes `search_catalogue`, `find_similar`, `get_title`, `get_shelf`, `save_to_shelf` and
`whats_on_tonight`. Tokens are hashed at rest and can be revoked from the same page.

## Posters

Posters are cached in R2 and resized on the way out through the Images binding, which negotiates
AVIF or WebP from the request's `Accept` header. The route only honours four widths so the number
of billable unique transformations stays small.

Transformations can also be served from another zone that already has them enabled, by adding
`marquee.pashi.app` under Images → Transformations → Sources there and pointing at
`/cdn-cgi/image/width=320,format=auto/https://marquee.pashi.app/media/posters/...`. There is no
billing advantage: transformations are counted per account, not per zone.
