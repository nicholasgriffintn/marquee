# Marquee

Marquee is a cinema without a building.

The Usher works here. He is the letter M off the sign out front, who climbed down one evening and
never went back up. Bow tie, torch, thirty years on the door. He has seen everything in the
building and most of it twice, and he will tell you when something is long.

<img src="https://marquee.pashi.app/usher-idle.png" width="200" height="200" alt="The Usher Welcomes You" style="float:right;margin:0 0 1em 1em;"/>

> Evening. Seat yourself.

## Front of house

Search the whole catalogue and get an answer while you are still typing — keyword and meaning both,
so a half-remembered plot finds the film as readily as its title does. Tell him which services you
pay for and everything narrows to what you can actually press play on. What's on tonight is on the
front page; your own shelf, with ratings and notes on it, is one click away.

He does the asking. On your first visit he works out what you pay for, what you reach for and why
you pick what you pick, one question at a time, and after that he stays quiet — one uninvited word
per session, and he takes a hint after three. He turns up where he is relevant: at the end of a
shelf to ask whether it landed, on a title that has sat unwatched since spring, on a search that
found nothing. And if you cannot decide, he will simply pick something and tell you why.

<img src="https://marquee.pashi.app/usher-unimpressed.png" width="200" height="200" alt="The Usher is Unimpressed"/>

> Everyone's watching that one. Doesn't mean it's good.

When even that is too much, he takes your order. Three questions — who is in the room, how long you
have, what you are in the mood for — and he comes back with one title he will stake his name on,
the service it is on, and two backups in case you are difficult. He has been doing it that way
since a couple spent eleven minutes reading the board in 1981. Nobody has ever needed a fourth
question.

Monday mornings he writes up the week: fresh releases near your taste, what is stirring, and the
episodes coming. It waits for you at `/this-week`.

## The notebook

Everything he has worked out about you is in the notebook, and so is the map. Every title you have
marked is placed by what it is rather than what it is called, so the things that are alike sit
together. The two directions are the first two components of the embeddings rather than anyone's
genre list, and where one end of one has a character to it he writes it in the margin. Hover a mark
— or tab to it — and he tells you what it is and the nearest thing to it on your shelf. If he has
not read something on your shelf yet he says so, and goes and reads it.

Bring a history with you if you have one: link Trakt and your watch history, ratings and watchlist
come across, and a Letterboxd export can be walked in through the door.

## One episode at a time

A television title's panel carries its own episode guide. Tick episodes off, rate them out of five,
keep a note against any of them or against the season as a whole. _I am up to here_ marks
everything aired before it in one go, for the sensible people who do not tick as they watch.

Every write rolls up into the shelf: the pointer moves to the furthest episode watched, a
watchlisted series becomes one you are watching, and when the last aired episode is ticked the
whole thing goes down as watched. Your episode notes are read alongside your title notes when the
Usher works out what he thinks of you.

## Take it with you

Marquee knows when things happen — the next episode of something on your shelf, the release of a
film you are waiting for — and that only ever showed up while you had the site open. Cut a key on
the Notebook page and it goes where you already look: an iCalendar feed at `/feeds/<key>/diary.ics`
for your calendar, an Atom feed at `/feeds/<key>/alerts.atom` for your reader.

The calendar carries episodes of anything you are watching or have on the watchlist, from both
places dates are kept — TVmaze for the week ahead, which knows the clock time, and TMDB's season
records for everything announced after that, which only knows the day. Anything you have already
ticked off is left out, and unreleased watchlist titles arrive as all-day entries on their release
date. The reader carries the notes the Usher would have posted and the Monday digest — a second
channel alongside email, on the same pipeline and under the same weekly cap, and one that does not
need a confirmed address.

Cinema showings are deliberately absent. A calendar client reads from wherever it happens to live,
so placing them would mean keeping a location against an account, and Marquee does not.

## What's on locally

A cinema without a building still knows the ones that have them. Sign in and a film's panel carries
what is on at the cinemas near you, under the streaming options. The position comes from
Cloudflare's edge — roughly a town, never a street. Nothing is asked of you, no permission prompt
is raised, and no location is stored against an account.

Each chain answers with whatever precision it can manage on the day, and the panel renders
honestly: times where there are times, days where there are only days, and a link to their board
where there is neither.

| Chain        | What they publish                                                           |
| ------------ | --------------------------------------------------------------------------- |
| Cineworld    | Exact showtimes with booking links, and their own coordinates               |
| Picturehouse | Exact showtimes; venues are read off the site and placed from OpenStreetMap |
| Vue          | Which days a film is on at a site, but not the clock times                  |

Odeon and Curzon publish nothing readable — both sit behind a bot challenge a Worker does not get
through. They are absent rather than approximated.

## The door

Most of the job is letting people in; the rest of it is not, and the API's rate limits and bot
checks speak in his voice rather than a status code's. Ask too fast and you get _"Steady on. One at
a time."_ Arrive as something that is not a person and you get told that he has seen a lot of faces
and not one of them was yours. Try a door that is not yours and you meet the manager's office
instead: frosted glass, a name painted on it, a note that has said _back in ten minutes_ since 1974.

He is not in. He is never in. Nor is the projectionist, who runs the sweeps and the long nights of
ingestion, and who gets a note of his own on the admin page.

<img src="https://marquee.pashi.app/usher-thinking.png" width="200" height="200" alt="The Usher Has Some Advice" />

> If I've nothing worth saying, I say nothing. Try it.

---

## What it runs on

Cloudflare Workers throughout — D1, R2, Queues, Workflows, Vectorize, Workers AI, Images and Email
Service. `wrangler.json` declares all of it, and `wrangler` creates most of it for you on first
deploy.

Outside data needs keys. Every client checks for its own and stands down quietly without it, so a
partial setup runs; it just knows less.

| Key                                    | Gives you                                          |
| -------------------------------------- | -------------------------------------------------- |
| `TMDB_API_TOKEN`                       | Titles, images, credits, providers — the catalogue |
| `GITHUB_CLIENT_ID` / `_SECRET`         | Sign-in                                            |
| `WATCHMODE_API_KEY`                    | Service directory, gap-filling on saved titles     |
| `OMDB_API_KEY`                         | Awards, box office, search beyond the catalogue    |
| `SIMKL_CLIENT_ID`                      | Anime tags and scores                              |
| `TRAKT_CLIENT_ID` / `_SECRET`          | Importing a viewer's history                       |
| `CLOUDFLARE_ACCOUNT_ID` / `_API_TOKEN` | AI Gateway                                         |

TMDB is the one you cannot really run without. Air dates come from TVmaze and the trending rail
from Wikipedia pageviews; neither needs a key.

## Running it locally

```bash
cp .dev.vars.example .dev.vars
pnpm install
pnpm exec wrangler vectorize create marquee-titles --dimensions=1024 --metric=cosine
pnpm db:migrate:local
pnpm dev
```

Open <http://localhost:8787>.

Fill in `.dev.vars` from the table above. For sign-in, create a GitHub OAuth app with
`http://localhost:8787/api/auth/callback/github` as its callback URL. For Trakt, an application at
<https://trakt.tv/oauth/applications> with `http://localhost:8787/api/links/trakt/callback`.

D1 and the queues run locally. Nothing syncs on its own — crons do not fire on a timer, and the
scheduled handler is a no-op while `LOCAL_DEV=true`, so no third-party rate limit is spent while you
work. Run jobs by hand from `/admin`, which has a button for each one and takes the same code path
the crons take in production. To exercise the cron entrypoint itself, set `LOCAL_SYNC=on` and hit
`/cdn-cgi/local/scheduled`.

## Deploying

Set the secrets listed under `secrets.required` in `wrangler.json`, then:

```bash
pnpm db:migrate:remote
pnpm deploy
```

Migrations are a separate step — `pnpm deploy` only type-checks, builds and ships. Point the
`routes` entry in `wrangler.json` at your own domain, set `SITE_ORIGIN` if the Worker is served
behind a different canonical one, and add the deployed callback URL to the GitHub OAuth app.

Magic-link sign-in rides on [Cloudflare Email Service][email-service] through the `send_email`
binding, so no third party sees who is asking for a ticket. Onboard a sending domain and point
`MAIL_FROM` at an address on it; leave `MAIL_FROM` unset and the box office quietly drops the
option. `/api/auth/methods` only advertises what the deployment can actually do.

[email-service]: https://developers.cloudflare.com/email-service/

The first account to sign in becomes the administrator; everyone after that is a viewer. If you
lock yourself out:

```bash
pnpm exec wrangler d1 execute DB --remote --command "UPDATE users SET role = 'admin' WHERE github_login = 'your-login'"
```

A fresh deployment fills in over the first few sweeps rather than all at once. Watch it on `/admin`.

## Notes for the curious

**Search** is hybrid: an FTS5 index over titles, synopses, keywords and credits for precision, a
Vectorize index of bge-m3 embeddings for meaning, the two interleaved and reranked by
`@cf/baai/bge-reranker-base`. The AI shelves sit on top of that rather than driving it — a viewer's
taste vector is the mean of what they save, blended with what they have told the Usher, and the
model only names a shelf and picks from a shortlist it can see.

**The sweeps** are a Workflow on two crons: a light one every three hours, a deep one nightly that
fans TMDB's discover pages out over the ingestion queue. Sweeps merge rather than replace,
embeddings are keyed on a hash of their source text so nothing is re-embedded for the sake of it,
and a source that answers 429 is stood down rather than retried.

**The door** is one guard in `worker/security/guard.ts`, driven by two tables in
`worker/security/policies.ts` — `POLICIES` for stances and budgets, `RULES` for path matching, first
match wins, ending in a catch-all. New endpoints are covered the moment they are mounted. Set
`BOT_PROTECTION=off` to keep rate limits but drop the bot check when debugging a client that trips
the heuristics.

**Feed keys** are hashed at rest, so the links are shown once when you cut one and a new key
retires the old one. Nothing under `/feeds` needs a cookie, which is what lets a calendar client
read it at all — the guard covers the path with a `feed` policy that lets machines through and rate
limits them like any public read, and responses carry `x-robots-tag: noindex`.

**Cinema chains** are one `CinemaSource` adapter each, plus a line in
`worker/clients/cinema/index.ts`. Nothing above that module knows which chain or which country it
is talking to. Listings are only pulled near somewhere a member has actually looked from, so the
work grows with the audience rather than with the map.

**Agents** — Marquee speaks MCP at `/mcp`. Mint a token on the Sources page:

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
`whats_on_tonight`.

**Posters** are cached in R2 and served from the app's own hostname through Cloudflare Images. Keep
the four widths in `src/lib/media.ts` and `worker/routes/media.ts` aligned, or the number of
billable unique transformations stops being bounded.

**The artwork** is in `public/`, all of it cut from `usher.svg`, in ink, paper, acid and coral and
nothing else. He is drawn to survive on his own dark background, so anything you add to him wants a
paper core and an ink keyline or it will disappear into the page.
