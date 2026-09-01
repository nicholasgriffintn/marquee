# History imports

Status: implemented

Date: 1 September 2026

## Product boundary

Marquee supports five import routes:

- **IMDb** watchlist and ratings CSV exports
- **Letterboxd** account export ZIP files
- **Trakt** through the existing OAuth connection
- **JSON** using Marquee's portable activity format
- **CSV** using the same portable activity fields

Every route ends at the same preview, title matching, review, commit, and removal pipeline. There
are no provider-specific shelf write paths and no alternate data model.

Raw file contents stay in the browser. The browser parses exports in a Web Worker and uploads only
normalised activities. Trakt is the only remote provider connection; its access credentials use the
existing encrypted token store.

## User flow

1. Choose IMDb, Letterboxd, Trakt, JSON, or CSV.
2. Follow the source-specific export instructions.
3. Inspect the file locally and see recognised activity counts.
4. Choose **Match and preview**.
5. Review totals and resolve uncertain titles using poster-led catalogue choices or search.
6. Choose **Use selected title** or **Don't import this** for every uncertain match.
7. Commit the preview explicitly.
8. Inspect or remove the import from import history.

Removing an import deletes only that run's events and then rebuilds affected shelf entries. Manual
Marquee choices remain authoritative.

## Portable JSON and CSV

JSON is an array of objects. CSV uses the same field names as its header row.

| Field            | Meaning                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| `imdb_id`        | IMDb title id such as `tt0068646`                                                     |
| `tmdb_id`        | TMDB title id; include `type` so the movie/show namespace is unambiguous              |
| `tvdb_id`        | TVDB show id                                                                          |
| `type`           | `movie`, `show`, `season`, or `episode`                                               |
| `title`          | Display title and matching fallback; recommended even when an external id is supplied |
| `year`           | Release year                                                                          |
| `season`         | Season number; required with `episode`                                                |
| `episode`        | Episode number; the external id must identify the parent show                         |
| `watched_at`     | ISO 8601 timestamp, or `unknown` for a watch with no reliable timestamp               |
| `watchlisted_at` | ISO 8601 timestamp                                                                    |
| `rating`         | Integer from 1–10, converted to Marquee's five-point scale                            |
| `rated_at`       | ISO 8601 timestamp; read only when `rating` is present                                |

At least one supported external id or a title is required. Each row must contain a watch,
watchlist, or rating activity. Invalid identifiers, dates, types, and number ranges fail closed
with a row-specific message.

```json
[
  {
    "imdb_id": "tt0068646",
    "type": "movie",
    "title": "The Godfather",
    "watched_at": "2024-10-25T20:00:00Z",
    "rating": 9,
    "rated_at": "2024-10-25T21:00:00Z"
  }
]
```

```csv
imdb_id,type,title,year,season,episode,watched_at,watchlisted_at,rating,rated_at
tt0068646,movie,The Godfather,1972,,,2024-10-25T20:00:00Z,,9,2024-10-25T21:00:00Z
tt0903747,show,Breaking Bad,2008,1,1,2024-10-26T20:00:00Z,,,
```

## Letterboxd ZIP handling

The browser reads the ZIP central directory and extracts only these root files:

- `diary.csv`
- `ratings.csv`
- `watched.csv`
- `watchlist.csv`

Deleted, orphaned, review, comment, and like files are ignored. Encrypted archives, unsupported
compression methods, malformed directories, oversized files, and archives with excessive entries
are rejected. Nothing is written to the local filesystem.

## Persistence and projection

- `viewer_import_runs` stores owner, adapter version, fingerprint, status, counts, and bounded
  errors.
- `viewer_import_records` stores normalised activities and title-match decisions.
- `viewing_events` is the immutable source of imported and manual viewing facts.
- `viewer_external_item_matches` remembers one viewer's explicit provider-title choices.
- `viewing_entries` and `viewing_episode_entries` remain fast projections for existing reads.

The migration converts existing shelf and episode choices once into canonical `marquee` events.
Runtime writes use the same event model immediately; there is no secondary read or write path.

## Projection rules

- Manual status, rating, removal, and episode choices win over imported values.
- Imported state may strengthen a shelf entry but cannot erase a manual decision.
- Rewatches remain separate events.
- The newest valid watch timestamp becomes `last_watched_at`.
- Imported episode events update episode progress without flattening them into title-only history.
- Repeating an input or queue delivery is idempotent through run, record, and event keys.
- Removing a run deletes its events and deterministically reprojects only affected titles.

## Matching and review

Matching uses exact TMDB, IMDb, or TVDB identifiers first, followed by remembered viewer choices,
then exact normalised title and year. Fuzzy results are suggestions only.

Ambiguous records show up to six catalogue candidates with posters, title, year, and media type.
The user must select and confirm a title or skip the record. A confirmed provider-item choice is
remembered only for that viewer.

## Security and limits

- Every import endpoint requires an authenticated session and scopes every query by viewer id.
- Write rate limits apply to run creation, staging, resolution, commit, and removal.
- Files are limited to 25 MB; Letterboxd CSV entries are limited to 10 MB each.
- A run accepts at most 25,000 normalised records in batches of 100.
- Titles, provider ids, source ids, dates, ratings, years, seasons, and episodes are validated on
  both sides of the network.
- Raw files, title text, viewing payloads, and provider credentials are not logged or sent to
  analytics.
- Queue messages contain only run and viewer identifiers.
- Account deletion cascades through runs, records, events, and remembered matches.

## Operational behaviour

Matching and commits use the existing ingestion queue. Queue delivery is idempotent, commits run in
bounded chunks, and user-visible runs become failed after permanent errors or exhausted retries.
Review records are paged so large imports do not hide uncertain matches after the first page.

Trakt history fetching is paged and preserves individual plays, timestamps, ratings, watchlist
entries, and episode identity. Trakt export continues to use the shelf projection and uses
`last_watched_at` for history dates.

## Validation gate

Run the repository's supported checks without starting a development server:

- `pnpm check`
- `pnpm lint`
- `pnpm format:check`
- `pnpm check:migrations`
- `pnpm build`

The repository deliberately has no automated test runner. Validate the supplied Letterboxd ZIP
shape, IMDb export headers, portable examples, idempotent run creation, ambiguous review, manual
precedence, and import removal through the implementation and static/build gates.
