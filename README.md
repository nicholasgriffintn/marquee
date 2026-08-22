# Marquee

Marquee is a cinema without a building. Live title search, discovery that knows which services you
actually pay for, what's on tonight, Cloudflare AI recommendations, and a shelf you keep yourself
with ratings and notes on it.

The Usher works here. He is the letter M off the sign out front, who climbed down one evening and
never went back up. Bow tie, torch, thirty years on the door. He has seen everything in the
building and most of it twice, and he will tell you when something is long.

<img src="https://marquee.pashi.app/usher-idle.png" width="200" height="200" alt="The Usher" style="float:right;margin:0 0 1em 1em;"/>

> Evening. Seat yourself.

Title metadata and images come from TMDB. Streaming, rental and purchase availability comes from
JustWatch, both through TMDB's watch-provider API and directly for per-service deep links.
Watchmode supplies the service directory and fills the gaps on saved titles. Sign-in is GitHub
OAuth.

Air dates come from TVmaze, broadcast and streaming both; anime tags and scores from AniList;
awards and box office from OMDb. The trending rail is ranked by how much Wikipedia has been read
about a title this week, which is a better measure of a fuss than any press release. Link Trakt and
your watch history, ratings and watchlist come with you.

<img src="https://marquee.pashi.app/usher-thinking.png" width="200" height="200" alt="The Usher" style="float:right;margin:0 0 1em 1em;"/>

<img src="https://marquee.pashi.app/usher-unimpressed.png" width="200" height="200" alt="The Usher" style="float:right;margin:0 0 1em 1em;"/>

> Everyone's watching that one. Doesn't mean it's good.

He has five faces — attentive, thinking, pleased, unimpressed, asleep — and gets by on about two of
them. The artwork is in `public/`, all of it cut from `usher.svg`, in ink, paper, acid and coral and
nothing else. He is drawn to survive on his own dark background, so anything you add to him wants a
paper core and an ink keyline or it will disappear into the page.

> If I've nothing worth saying, I say nothing. Try it.

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

The catalogue sweep is a Workflow on two crons. A light sweep every three hours refreshes the
homepage head, the TVmaze schedule and the Wikipedia buzz sample, and queues availability,
enrichment, embeddings and the homepage sections. A deep sweep once a night additionally syncs the
provider ledger and fans all of TMDB's discover pages out over the ingestion queue.

Keywords, credits and embeddings arrive as titles are re-hydrated from TMDB, so a fresh deployment
fills in over the first few sweeps rather than all at once. A sweep merges rather than replaces:
ratings, external ids and fetched availability survive a re-hydration, and a title whose TMDB
record has not moved is not rewritten at all. Embeddings are queued 2,000 at a time and keyed on a
hash of the text they are built from, so a title is only re-embedded when that text changes.

Availability is refreshed on a rolling seven-day window, 400 titles a sweep, oldest first. A source
that answers 429 is stood down for a while rather than retried, and the pause shows on the Sources
page next to its call budget.

A second cron on Monday mornings runs the digest workflow, which writes a per-viewer digest of
fresh releases near their taste, what is trending, and the week's episodes, readable at `/this-week`.

## Admin

Accounts carry a role, `viewer` or `admin`. The first account to sign in on a fresh deployment
becomes the administrator; everyone after that is a viewer. Admins get an `/admin` page in the
navigation with the pipeline's call budgets, enrichment coverage, recent jobs, failures and the
homepage rails, plus buttons to start a sweep, rebuild the digests, queue a backfill, or resume a
source that has been stood down after a rate limit. Roles are granted and revoked from the same
page, and the last remaining administrator cannot be demoted.

Everything under `/api/admin` requires an administrator session. If you ever lock yourself out,
promote an account directly:

```bash
pnpm exec wrangler d1 execute DB --remote --command "UPDATE users SET role = 'admin' WHERE github_login = 'your-login'"
```

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

Posters are cached in R2. Images transformations are enabled on the `pashi.app` zone, so the
production client requests four fixed widths from the app's own `marquee.pashi.app` hostname:

```text
https://marquee.pashi.app/cdn-cgi/image/width=320,fit=scale-down,format=auto/media/posters/...
```

The URL is emitted as a same-origin relative path; no separate image hostname or CSP exception is
needed. Local and preview deployments keep using `/media/posters/...?w=320`, which resizes through
the Worker's Images binding. Both paths negotiate AVIF or WebP from the request's `Accept` header.
Keep the four widths in `src/lib/media.ts` and `worker/routes/media.ts` aligned so the number of
billable unique transformations stays bounded. Transformations are counted per account, not per
hostname.
