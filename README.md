# Marquee

Marquee is a streaming discovery service with live title search, provider-aware discovery, current watch destinations, Cloudflare AI recommendations, and a personal shelf with ratings and notes.

Title metadata and images come from TMDB. Streaming, rental, and purchase availability comes from JustWatch through TMDB's watch-provider API.

## Local development

Copy `.dev.vars.example` and replace with your env variables:

```dotenv
cp .dev.vars.example .dev.vars
```

Create a GitHub OAuth app with `http://localhost:8787/api/auth/github/callback` as its local
authorisation callback URL and `https://<your-domain>/api/auth/github/callback` for your deployed domain, then put its client ID and client secret in `.dev.vars`.

Then start:

```bash
pnpm db:migrate:local
pnpm dev
```

Open <http://localhost:8787>

## Deployment

Install dependencies, authenticate Wrangler, and create the D1 database:

```bash
pnpm install
```

Put your secrets:

```bash
pnpm exec wrangler secret put TMDB_API_TOKEN
pnpm exec wrangler secret put CLOUDFLARE_ACCOUNT_ID
pnpm exec wrangler secret put CLOUDFLARE_API_TOKEN
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
```

If the
Worker is served behind a different canonical domain, set `SITE_ORIGIN` to that HTTPS origin in
`wrangler.json`.

Deploy the application and apply its remote D1 migration:

```bash
pnpm deploy
```
