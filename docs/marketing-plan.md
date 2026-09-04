# Getting people through the door

A plan for taking Marquee from five accounts to a real audience: what to fix in the building first,
what content the catalogue can earn on its own, and where to go and say hello. Written 4 September
2026 against production, two weeks after the first deploy.

**Status, same day.** Repairs 1 to 4 and 6 to 9 are built on this branch, with two changes of
mind. The metadata pass runs only for the routes that need a per-URL card — titles, people,
collections, the revival house, listings, the directory and This Week — rather than for every HTML
request, and the Worker requests the shell without conditional headers and re-stamps the caching
headers so a decorated page cannot be served from a stale or empty 304. AI search agents and SEO
tools are admitted by user agent while training crawlers are refused in `robots.txt`. Of the pages
below, browse-by-service and genre, the public This Week edition with back issues, the revival hubs
and the copyright explainer exist. Leaving Soon does not, because no source records when an offer
ends. Still to do by hand: Search Console, Bing, the Web Analytics token, the App Store
submission, and the launch itself.

## Where we stand

| What                             | Count           |
| -------------------------------- | --------------- |
| Accounts                         | 5               |
| Titles in the catalogue          | 719,166         |
| Titles with a UK streaming offer | 94,780          |
| Titles with popularity ≥ 5       | 29,685          |
| People on the credits            | 1.47m           |
| Collections                      | 5,045           |
| Streaming services tracked       | 180             |
| Approved revival prints          | 13,999          |
| Cinemas with listings            | 112             |
| GitHub stars                     | 1               |
| iOS                              | TestFlight only |

There is no acquisition analytics at all. Analytics Engine records product events (searches, rail
clicks, provider exits) but nothing about page views, referrers, landing pages or campaigns, so
today we cannot tell where a visitor came from or which page they arrived on.

## The pitch

**Marquee is what to watch tonight, across every UK service you pay for — with a free cinema at the
back.**

Three audiences, in order:

- **UK households paying for two or more services** who open Netflix, scroll for twenty minutes and
  put YouTube on. The hook is "tell me what you pay for and I will only show you what you can press
  play on", then the Usher's three-question order.
- **Classic and silent film people.** Fourteen thousand out-of-copyright prints, streamed here with
  no account, each one carrying its UK provenance. Nobody else does the British term properly.
- **Developers and the agent-curious.** GPL, Cloudflare Workers end to end, hybrid search, an MCP
  server. This crowd will not use the app much but they are how the first two find out it exists.

What sets it apart, and what every piece of copy should lean on: UK-first, free, no adverts, no
tracking, open source, and a character with opinions. Avoid "AI-powered" as a headline. The Usher is
the story, the models are plumbing.

## The building, before anyone visits

Ranked. Everything in the first group is a defect that undoes work already done.

### 1. The per-page metadata never ships (critical)

`worker/lib/share.ts` builds a title, description, canonical, Open Graph card and JSON-LD for
every title, person, collection, revival print and listings facet, and `withPageMetadata` injects it
with HTMLRewriter. In production none of it reaches the browser. Every route returns the same
`<title>Marquee — Streaming, without the hunt</title>` with no canonical and no structured data.

The cause is `assets.run_worker_first` in `wrangler.json`. Only the listed paths reach the Worker;
`/`, `/movie/*`, `/tv/*`, `/person/*`, `/collection/*`, `/revival/*`, `/listings`, `/directory`,
`/tour` and the rest are answered by the assets binding, which serves the SPA fallback and never
runs the `notFound` handler. The client-side `usePageMetadata` hook patches the tab title after
JavaScript runs, which is why nobody noticed.

Fix: set `run_worker_first` to `["/*", "!/assets/*"]` so every HTML request goes through the
Worker and static assets still bypass it. Confirm with `curl -s https://marquee.pashi.app/movie/27205/inception | grep canonical`.

### 2. Share cards are half broken

Even once the tags ship, `/media/og/:titleId.png` sits behind the `media` policy, which admits only
humans and Cloudflare-verified crawlers. Live test: Facebook, WhatsApp, iMessage and Bluesky get the
image; Twitter/X, Slack and Discord get a 403 and no picture. Give `/media/og/*` its own rule with
the `open` stance. It is a cached PNG behind a rate limit; there is nothing to protect.

### 3. The sitemap index forgets three sitemaps

`/sitemap.xml` lists `pages.xml` and the 72 title files. `people.xml`, `collections.xml` and
`revival.xml` are served but nothing links to them, so search engines never see the person,
collection or revival URLs. Add them to the index. Add `/this-week` to `STATIC_PATHS` once it has a
public face (see content below).

### 4. Seven hundred thousand thin URLs on a two-week-old domain

Google will crawl a new domain at a few hundred to a few thousand pages a day, and a title page for
a film with no UK offer is a thin page whose description says so. Put the crawl budget where the
value is:

- Sitemap only titles that have a UK offer or popularity ≥ 5. That is 30,000 to 95,000 URLs rather
  than 719,000, and they are the ones that answer a real "where to watch" query.
- In `share.ts`, return `index: false` for a title with no providers and low popularity. The page
  still exists and still links out; it just does not ask to be ranked.
- Keep `lastmod` honest. The sitemap already orders by popularity, which is right.

### 5. The page body is empty until JavaScript runs

The shell is `<div id="root"></div>`. Google renders JavaScript, but rendering is queued and the
rendered page then has to call `/api/catalog/...`, which the guard only admits for verified bots.
A live probe shows `cf.botManagement` is present (a plain browser-UA `curl` is refused as suspect),
so a real Googlebot should pass as a verified bot, but that has never been checked.

- **Now:** register Search Console, submit the sitemap, run URL Inspection on a title page and read
  the rendered HTML. If the cast and providers are missing, the guard is blocking the render.
- **Next:** render a plain-HTML core into `#root` for the indexable routes — h1, year, synopsis,
  the provider list, top billing — with the same HTMLRewriter pass that injects the head. React
  replaces it on mount. JSON-LD earns rich results; body text is what ranks.

### 6. Decide about AI search crawlers

GPTBot, ClaudeBot, PerplexityBot, CCBot and friends are classed as automation and refused at the
API, so they see an empty shell. "Where can I watch X in the UK" is now a question people ask
ChatGPT and Perplexity, and their search agents cite sources. Recommendation: admit the search
agents (`OAI-SearchBot`, `PerplexityBot`, `Claude-SearchBot`) on `read` and `media`, and use
`robots.txt` to refuse the training crawlers (`GPTBot`, `ClaudeBot`, `CCBot`, `Bytespider`). That
is a product decision, not a technical one; the plan assumes yes.

### 7. Nobody can measure anything

- Add Cloudflare Web Analytics. It is cookieless, needs no consent banner, and fits the privacy
  policy as written. It needs `static.cloudflareinsights.com` in `script-src` and
  `cloudflareinsights.com` in `connect-src`.
- Search Console and Bing Webmaster Tools, sitemap submitted to both.
- Add `utm_source` capture to the first `rails_served` or `title_view` event per session so
  campaign traffic shows up in the same Analytics Engine dataset the admin page already reads.

### 8. The front page does not say what the building is

A signed-out visitor lands on the Tonight page: a featured title as the h1, the Usher console, and
a service picker. Nowhere does it say Marquee is UK-first, free, ad-free, or that a free cinema
exists. The meta description does; the page does not.

Add one strip for signed-out visitors only, in the Usher's voice, below the hero: a sentence on what
this is, three receipts (every UK service in one place, a free public-domain screen, your shelf on
your calendar), and "Get a ticket". Not a marketing hero. Signed-in viewers never see it.

### 9. Smaller repairs

- `/this-week` is indexable but shows "Sign in first". Either `noindex` it or give it the public
  edition below.
- `/screening` is in `NOINDEX_PATHS` but its static card returns `index: true`, and the card wins.
  Make them agree.
- Add a web manifest so "Add to Home Screen" works on Android and iOS Safari, and the
  `apple-itunes-app` smart banner the day the App Store listing goes live.
- The guard refuses Ahrefs, Semrush, Screaming Frog and every other SEO tool. Any audit run from
  outside will report the site as broken. Either allow-list them for `read` or run audits with
  `BOT_PROTECTION=off` against a preview.
- Sign-in offers GitHub and a magic link. Put the magic link first; GitHub is a developer signal
  on a consumer app.

## Content the catalogue can earn on its own

No blog. The catalogue is the content; the job is to give it pages that answer the queries people
type, link them together so a crawler can walk them, and add the small amount of editorial the
pipeline already produces.

### Programmatic pages that already exist

| Page                              | Query it answers                                      | What it needs                                                                |
| --------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `/movie/:id`, `/tv/:id`           | "where to watch X uk", "is X on netflix"              | Repairs 1, 4, 5. Cast links to people, collection links to sets.             |
| `/person/:id`                     | "X films", "X movies in order"                        | Repair 3. Sort by year, and say how many are streaming.                      |
| `/collection/:id`                 | "X films in order"                                    | Repair 3. Already in release order.                                          |
| `/listings?type&genres&providers` | "horror films on disney plus uk", "new on netflix uk" | An h1 and one paragraph per facet, and links so the facets are discoverable. |
| `/revival/:id`                    | "watch X free", "X 1922 full film"                    | Repair 3. Already carries provenance and `VideoObject` data.                 |

### Pages to add

- **Browse by service and by genre.** A block on `/listings` and in the footer linking the top
  twenty services by title count × film/TV, and every genre × film/TV. About 120 facet pages,
  each canonicalised already. Add them to `pages.xml`. This is the "new on Netflix UK" surface
  and the one most likely to rank inside three months.
- **A public edition of This Week.** The Monday digest workflow already computes new arrivals and
  returning series. Publish a non-personalised edition at `/this-week` for signed-out visitors,
  dated and archived at `/this-week/2026-09-07`, with the personalised one behind sign-in as now.
  One recurring page, weekly, from a pipeline that already runs. This is the page that gets
  linked, shared and bookmarked, and it is the natural subject of every social post.
- **Revival hubs.** Decade pages, director pages for the names with depth (Chaplin, Keaton,
  Méliès, early Hitchcock), and one explainer: "Why Metropolis is not public domain in Britain
  until 2047". That last one is written already in the README; it wants a URL of its own. It is
  the single most linkable thing in the building.
- **Leaving soon,** if `title_provider_state` can tell us an offer's end date. "Leaving Netflix UK
  this month" is a monthly search with real volume and few good UK answers.

### Off-site writing

Four engineering pieces on the personal blog, each linking back to the page it describes, each
submitted to Hacker News and the Cloudflare community:

- Hybrid search on Workers: FTS, bge-m3 in Vectorize, reranked, interleaved.
- Checking the UK copyright term from Wikidata, and why the American rule of thumb is wrong here.
- Streaming two-hour prints from R2 with byte ranges and a multipart copy that survives Worker limits.
- An MCP server for a film catalogue, with scoped tokens and confirm-before-write.

Cloudflare runs a developer showcase and a "Built with" series; Workers AI, Vectorize, Workflows,
Durable Objects, Email Service and Images in one open-source app is exactly what they feature.
Ask.

## Getting the word out

Twelve weeks, three phases. Nothing goes out until phase 0 is done, because every link shared
before repair 1 lands shows the generic card.

### Phase 0 — Repairs (week 1)

Repairs 1, 2, 3, 7 and 8 above, Search Console live, a rendered-HTML check on one title page, one
listings facet page verified indexable. Ship the App Store submission in parallel; review takes a
week and TestFlight is a dead end for discovery.

### Phase 1 — Launch (weeks 2–4)

One launch per audience, spaced a week apart so each can be watched.

- **Hacker News, "Show HN".** Tuesday to Thursday, 14:00 UK. Lead with the revival house and the
  British copyright rule; developers will find the Workers stack in the README on their own. The
  README's voice is the pitch. Be in the thread for six hours.
- **Reddit, feature by feature, one subreddit at a time**, following each one's self-promotion
  rule: r/publicdomain and r/silentfilms (the revival house), r/trakt and r/Letterboxd (import and
  two-way sync), r/CloudflareDevelopers and r/selfhosted (GPL, `pnpm deploy`), r/CasualUK or
  r/britishproblems only if there is a genuinely funny Usher line to hang it on.
- **Bluesky and Mastodon.** The Letterboxd crowd moved to Bluesky. Open a Marquee account with the
  social avatar already in `public/`, post the public This Week edition every Monday and one revival
  print every Friday with its provenance line. The Usher writes the posts.
- **MCP registries.** List the server on the official MCP registry, PulseMCP, Glama and Smithery.
  "Film catalogue" is an empty category and agent people are a distinct channel.
- **Product Hunt** last, if at all. It skews American and the app is UK-only by design.

### Phase 2 — Loops (weeks 5–12)

- **Screenings are the growth loop.** A host opens a room, sends a link, the room votes. Every
  guest is a visitor who arrives with a reason. Make the invite card carry the Usher and the film,
  and make joining not require an account until the vote.
- **Shareable picks.** The Usher's pick, with his reasoning, at a public URL with its own OG image.
  "He picked this for us" is the post people will actually make.
- **Film societies and clubs.** University film societies, Talking Pictures TV groups, the British
  silent film societies. The screening room and the revival house were built for them. Ten
  personal emails beat any campaign.
- **Newsletters.** Dense Discovery, Hacker Newsletter (picks from HN), TLDR Web Dev, and the
  public-domain and classic film newsletters. Pitch the revival house, not the app.
- **App Store.** ASO on "what to watch uk", "streaming guide uk", "where to watch". Screenshots
  of the Usher, not of grids.

## Receipts

Weekly, on the admin page or a spreadsheet, whichever is faster:

| Measure                                      | Source                   | 90-day target |
| -------------------------------------------- | ------------------------ | ------------- |
| Indexed pages                                | Search Console           | 5,000         |
| Search impressions and clicks per week       | Search Console           | 10,000 / 300  |
| Visitors per week and top referrers          | Cloudflare Web Analytics | 1,500         |
| Accounts                                     | `users`                  | 500           |
| Accounts active in the last 7 days           | `sessions`               | 100           |
| Provider exits per active account per week   | `provider_exit` event    | 2             |
| Screenings hosted, guests per screening      | `Screening` DO           | 20 / 3        |
| Shelf saves per new account in first session | `shelf_save` event       | 3             |

Provider exits are the measure that matters: someone pressed play. Everything else is a proxy.

## Things to be honest about

- **The domain.** `marquee.pashi.app` is a subdomain, "Marquee" is a common product name, and
  brand searches will find other things. Not worth fixing before there are users. Worth a domain
  once there are.
- **JustWatch and TMDB attribution** must stay on every page that shows availability. It does; keep
  it when the signed-out strip goes in.
- **Nothing here needs new dependencies.** Cloudflare Web Analytics is a script tag. Everything
  else is copy, config and SQL.
- **The Usher can carry the brand but cannot carry a blank page.** Repairs 1 and 8 come before any
  post, anywhere.
