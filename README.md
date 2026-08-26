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

He builds more shelves than will fit and puts out the ones that are yours: a service you pay for, a
name you follow, what is on at the cinemas near you. A shelf with nothing on it for you never goes
up at all.

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
come across, and a Letterboxd export can be walked in through the door. It goes back the other way
too — _send it there_ puts what you have marked here onto your Trakt account, watched as history,
stars as ratings out of ten, the rest as watchlist. It asks first, tells you what it is about to
send, and only sends what has changed since the last time, so nothing is counted twice.

<img src="https://marquee.pashi.app/usher-thinking.png" width="200" height="200" alt="The Usher Has Some Advice" />

> I have seen a lot of things. Not one of them was yours.

## One episode at a time

A television title's panel carries its own episode guide. Tick episodes off, rate them out of five,
keep a note against any of them or against the season as a whole. _I am up to here_ marks
everything aired before it in one go, for the sensible people who do not tick as they watch.

Every write rolls up into the shelf: the pointer moves to the furthest episode watched, a
watchlisted series becomes one you are watching, and when the last aired episode is ticked the
whole thing goes down as watched. Your episode notes are read alongside your title notes when the
Usher works out what he thinks of you.

## Names on the credits

Every credited name has a page — everything of theirs in the catalogue, newest first, and how much
of it is already on your shelf. The names on a panel go there rather than into a search box.

There is one button on it that matters. Following someone writes a note in the notebook in your own
hand, and that note is what the `person` alert detector has always been reading; until now the only
way to get one was to have the Usher notice a name recurring in what you saved. Unfollow and he
crosses it out without arguing. Behind both is a name-to-title index rebuilt with the rest of the
people index, which the detector now reads instead of scanning every payload for a matching name.

A film that belongs to a collection carries the rest of it under the panel, in release order, with
the one you are looking at marked.

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

## The revival house

There is a small screen at the back where the ticket is nothing, because the prints are out of
copyright. `/revival` is a repertory programme that plays here rather than sending you somewhere
else, on our own player, with no account and no service in the way.

This is a British building, so the question is whether a print is free **here**, and that is not the
question most public domain collections answer. Under section 13B of the CDPA a film's copyright
runs for 70 years from the death of the last of its principal director, its screenplay and dialogue
authors, and the composer of any music written for it. It is measured from people, not from a
release date, so the American rule of thumb — published long enough ago — tells you nothing about
Britain. _The Lost World_ (1925) is free in America and in copyright here until 2043. _Metropolis_
(1927) until 2047. _Nosferatu_ (1922) came free in 2020, because Henrik Galeen died in 1949.

So the gate is the UK term. A work is matched to the catalogue, its authors and their death dates
are read off Wikidata, and it is cleared only when every named author has a death date and the
latest of them is more than 70 years ago. Nothing else clears itself. In particular a work whose
authors could not be established does **not** fall back to the anonymous rule, because "we could not
find out" and "there is nobody to find" are not the same claim, and only the second one shortens the
term. The reviewer is told which of the two it looks like, and what the term would be if the work
really were anonymous.

Everything unresolved sits in a queue on `/admin` for a person, including the large pile that is
genuinely free in America and unprovable here. That is the right way round to be wrong, and it does
mean the shelf fills slowly.

What plays and what gets copied are two separate questions. Clearing the American term is enough to
list a print and let it stream straight from wherever it already lives — the browser talks directly
to archive.org, Europeana or the Library of Congress, and Marquee is pointing at a copy someone else
chose to publish rather than making one of its own, which isn't an act this building has to answer
for under UK law. The UK term is the stricter, independently-checked question, and clearing it earns
something more: a permanent copy in Marquee's own room, so the print no longer depends on someone
else's server staying up. Until that check lands, it keeps playing from the source.

Three places supply it. European archives through **Europeana**, filtered to things they have
published outright as Public Domain Mark or CC0 and that they serve as an actual file rather than a
landing page — a European institution releasing its own holding is the strongest signal available
for European material. The **Library of Congress** National Screening Room, which offers the file
for download when it is not aware of a restriction. And the **Internet Archive**, which is an open
upload platform and is never taken at its word.

Every print carries its provenance on its own page: which basis it is free under, when the UK term
ran out, who holds the copy, and a link back to the source record. A viewer can check the reasoning
rather than take our word for it either.

Prints are matched to catalogue titles the same way cinema listings are, so a film's ordinary panel
grows a _playing here, free_ row when we have one.

## The door

Most of the job is letting people in; the rest of it is not, and the API's rate limits and bot
checks speak in his voice rather than a status code's. Ask too fast and you get _"Steady on. One at
a time."_ Arrive as something that is not a person and you get told that he has seen a lot of faces
and not one of them was yours. Try a door that is not yours and you meet the manager's office
instead: frosted glass, a name painted on it, a note that has said _back in ten minutes_ since 1974.

He is not in. He is never in. Nor is the projectionist, who runs the sweeps and the long nights of
ingestion, and who gets a note of his own on the admin page.

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
| `OMDB_API_KEY`                         | Ratings, awards, box office, episodes, search      |
| `TRAKT_CLIENT_ID` / `_SECRET`          | Importing a viewer's history                       |
| `EUROPEANA_API_KEY`                    | British and European prints for the revival house  |
| `CLOUDFLARE_ACCOUNT_ID` / `_API_TOKEN` | AI Gateway                                         |

TMDB is the one you cannot really run without. Air dates come from TVmaze, the trending rail from
Wikipedia pageviews, and the revival house's UK term checks from Wikidata; none of those needs a
key. A [free Europeana key](https://pro.europeana.eu/page/get-api) is what turns on the British and
European side of the revival house — without it the other two sources still run.

A name only reaches `env` if it is listed under `secrets.required` in `wrangler.json`. Defining that
list switches off Wrangler's inference from `.dev.vars`, so anything you add to `.dev.vars` and not
to the list is silently absent at runtime. Add the name in both places.

## Running it locally

```bash
cp .dev.vars.example .dev.vars
pnpm install
pnpm exec wrangler vectorize create marquee-titles --dimensions=1024 --metric=cosine
pnpm exec wrangler queues create marquee-revival
pnpm exec wrangler queues create marquee-anime
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

## The iOS app

There's also a native SwiftUI client that lives in [`ios/`](ios/README.md), you can find out more about it there.

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

Every new account starts as a viewer. This prevents a public sign-in from claiming a fresh or
temporarily empty deployment. After the intended administrator signs in, inspect the users with
Wrangler from a trusted terminal and promote that account by its exact id:

```bash
pnpm exec wrangler d1 execute DB --remote --command "SELECT id, name, github_login, email, role FROM users ORDER BY created_at, id"
pnpm exec wrangler d1 execute DB --remote --command "UPDATE users SET role = 'admin' WHERE id = 'the-user-id'"
```

Keep this out-of-band promotion step in the deployment runbook. The application will reject any
later change that would leave the database without an administrator.

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

**External ids** come from whoever has them cheapest. TMDB hands over imdb, tvdb and wikidata ids
on the detail call we already make, so those are kept rather than fetched again. The anime ids —
AniList, MAL, AniDB, Kitsu, AniSearch, LiveChart, ANN and Simkl — come from Fribb's anime lists as
one file, because per-title lookups against an anime API cost more requests than they are worth.

**Bulk imports** never write straight through. `external_imports` records the source, the dataset,
the upstream version and what each run wrote. The version is the raw file's ETag, so an unchanged
list is skipped without downloading it; a list that has lost more than a tenth of its mappings
since the last good run is refused and logged rather than applied, and the writes themselves are a
`json_patch` that only touches a row whose ids would actually change. Trigger one from `/admin` or
let the nightly deep sweep check.

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

It exposes `search_catalogue`, `find_similar`, `get_title`, `get_shelf`, `save_to_shelf`,
`whats_on_tonight`, `whats_on_this_week`, `titles_by_person` and `follow_person`. The week tool
answers from the same shelf-aware diary the calendar feed is built from, so an agent sees exactly
what the subscription would show.

**Posters** are cached in R2 and served from the app's own hostname through Cloudflare Images. Keep
the four widths in `src/lib/media.ts` and `worker/routes/media.ts` aligned, or the number of
billable unique transformations stops being bounded.

**Prints** are mirrored into R2 and served from `/media/reel/:id`, a byte-range route that answers
206s so the scrubber works. The copy runs on the `marquee-revival` queue in 32 MB parts against an
R2 multipart upload, persisting the upload id and the parts between runs and re-queueing itself, so
a two-hour feature crosses several invocations without a Worker ever holding the whole file. Until
the copy lands the same route proxies the source, which is what keeps a print watchable the moment
it is approved and `media-src` at `'self'`. Nothing is transcoded — both sources already publish an
H.264 MP4 derivative. The deep sweep walks each source a page at a time behind a cursor; discovery,
matching and mirroring each have a button on `/admin`.

**The artwork** is in `public/`, all of it cut from `usher.svg`, in ink, paper, acid and coral and
nothing else. He is drawn to survive on his own dark background, so anything you add to him wants a
paper core and an ink keyline or it will disappear into the page.
