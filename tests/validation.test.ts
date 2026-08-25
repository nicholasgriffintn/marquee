import assert from "node:assert/strict";
import test from "node:test";

import { isIngestionJob } from "../worker/lib/validation.ts";
import type { IngestionJob } from "../worker/types.ts";

const validJobs = [
  { type: "sync-catalog" },
  { type: "sync-providers" },
  { type: "sync-discover-page", mediaType: "movie", page: 1 },
  {
    type: "sync-discover-page",
    mediaType: "tv",
    page: 500,
    partitionId: "tv:2020-01-01:2020-12-31",
  },
  { type: "measure-discover-partition", partitionId: "movie:1900-01-01:1999-12-31" },
  { type: "sync-schedule" },
  { type: "sync-buzz" },
  { type: "sync-cinemas", source: "cineworld" },
  { type: "sync-cinema-screenings", source: "picturehouse", siteId: "london-central_1" },
  { type: "sync-revival-source", source: "archive", collection: "feature_films", chain: true },
  { type: "sync-revival-source", source: "loc", chain: false },
  { type: "sync-revival-source", source: "europeana" },
  { type: "match-revival-works", chain: false },
  { type: "match-revival-works", chain: true },
  { type: "match-revival-works" },
  { type: "group-revival-prints" },
  { type: "check-revival-rights" },
  { type: "recheck-revival-works", chain: true },
  { type: "recheck-revival-works", chain: false },
  { type: "recheck-revival-works" },
  { type: "mirror-revival-work", workId: "archive.nosferatu-1922" },
  { type: "build-sections" },
  { type: "import-trakt-history", viewerId: "viewer-1", origin: "https://marquee.example" },
  { type: "push-trakt-shelf", viewerId: "viewer-1", origin: "http://localhost" },
  { type: "embed-titles", titleIds: ["movie:1", "tv:999"] },
  { type: "import-imdb-title", imdbId: "tt0013442" },
  {
    type: "import-diary-row",
    viewerId: "viewer-1",
    name: "Nosferatu",
    year: 1922,
    rating: 4,
    watchedAt: "2026-08-25",
  },
  {
    type: "import-diary-row",
    viewerId: "viewer-2",
    name: "Unknown year and rating",
    year: null,
    rating: null,
    watchedAt: "",
  },
  {
    type: "import-diary-row",
    viewerId: "v".repeat(128),
    name: "Earliest supported film",
    year: 1871,
    rating: 1,
    watchedAt: "1871-01-01",
  },
  {
    type: "import-diary-row",
    viewerId: "viewer-3",
    name: "Latest supported film",
    year: 2099,
    rating: 5,
    watchedAt: "2099-12-31",
  },
  {
    type: "import-diary-row",
    viewerId: "viewer-4",
    name: "Leap-day viewing",
    year: 2024,
    rating: null,
    watchedAt: "2024-02-29",
  },
  { type: "import-anime-ids", offset: 0, force: false },
  { type: "enrich-availability", titleId: "movie:1" },
  { type: "enrich-ratings", titleId: "tv:2" },
  { type: "enrich-anime", titleId: "movie:3" },
  { type: "enrich-anilist", titleId: "tv:4" },
  { type: "cache-poster", titleId: "movie:5" },
] as const satisfies readonly IngestionJob[];

const malformedJobs = [
  { name: "null", value: null },
  { name: "an array", value: [] },
  { name: "a missing discriminator", value: {} },
  { name: "a non-string discriminator", value: { type: 1 } },
  { name: "an unknown discriminator", value: { type: "unknown" } },
  {
    name: "an unsupported discover media type",
    value: { type: "sync-discover-page", mediaType: "person", page: 1 },
  },
  {
    name: "a discover page below the lower bound",
    value: { type: "sync-discover-page", mediaType: "movie", page: 0 },
  },
  {
    name: "a discover page above the upper bound",
    value: { type: "sync-discover-page", mediaType: "movie", page: 501 },
  },
  {
    name: "a fractional discover page",
    value: { type: "sync-discover-page", mediaType: "movie", page: 1.5 },
  },
  {
    name: "an invalid discover partition",
    value: { type: "sync-discover-page", mediaType: "movie", page: 1, partitionId: "movie:today" },
  },
  {
    name: "an invalid measured partition",
    value: { type: "measure-discover-partition", partitionId: "movie:today" },
  },
  {
    name: "an unknown revival source",
    value: { type: "sync-revival-source", source: "museum" },
  },
  {
    name: "an invalid revival chain flag",
    value: { type: "sync-revival-source", source: "archive", chain: "yes" },
  },
  {
    name: "an invalid archive collection",
    value: { type: "sync-revival-source", source: "archive", collection: "everything" },
  },
  {
    name: "an invalid Europeana country",
    value: { type: "sync-revival-source", source: "europeana", collection: "Atlantis" },
  },
  {
    name: "an invalid mirrored work ID",
    value: { type: "mirror-revival-work", workId: "nosferatu" },
  },
  { name: "an unknown cinema source", value: { type: "sync-cinemas", source: "odeon" } },
  {
    name: "an empty cinema site ID",
    value: { type: "sync-cinema-screenings", source: "vue", siteId: "" },
  },
  {
    name: "a cinema site ID containing punctuation",
    value: { type: "sync-cinema-screenings", source: "vue", siteId: "london/central" },
  },
  {
    name: "an empty Trakt viewer ID",
    value: { type: "import-trakt-history", viewerId: "", origin: "https://marquee.example" },
  },
  {
    name: "an oversized Trakt viewer ID",
    value: {
      type: "push-trakt-shelf",
      viewerId: "v".repeat(129),
      origin: "https://marquee.example",
    },
  },
  {
    name: "a non-HTTP Trakt origin",
    value: { type: "import-trakt-history", viewerId: "viewer-1", origin: "ftp://example.com" },
  },
  {
    name: "an HTTP-looking non-URL origin",
    value: { type: "import-trakt-history", viewerId: "viewer-1", origin: "http-not-a-url" },
  },
  {
    name: "an origin with a path",
    value: {
      type: "push-trakt-shelf",
      viewerId: "viewer-1",
      origin: "https://marquee.example/account",
    },
  },
  { name: "an empty title batch", value: { type: "embed-titles", titleIds: [] } },
  {
    name: "an oversized title batch",
    value: { type: "embed-titles", titleIds: Array.from({ length: 101 }, () => "movie:1") },
  },
  { name: "an invalid batched title ID", value: { type: "embed-titles", titleIds: ["movie:0"] } },
  { name: "an invalid IMDb ID", value: { type: "import-imdb-title", imdbId: "nm0000001" } },
  {
    name: "an empty diary title",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "",
      year: 1922,
      rating: 4,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "an oversized diary title",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "n".repeat(161),
      year: 1922,
      rating: 4,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a blank diary title",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "   ",
      year: 1922,
      rating: 4,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "an empty diary viewer ID",
    value: {
      type: "import-diary-row",
      viewerId: "",
      name: "Nosferatu",
      year: 1922,
      rating: 4,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "an oversized diary viewer ID",
    value: {
      type: "import-diary-row",
      viewerId: "v".repeat(129),
      name: "Nosferatu",
      year: 1922,
      rating: 4,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a diary row missing its year",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      rating: 4,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a diary row with a string year",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: "1922",
      rating: 4,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a diary row missing its rating",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a diary row with a string rating",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: "4.5",
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a diary row missing its watched date",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: 4,
    },
  },
  {
    name: "a diary row with a non-string watched date",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: 4,
      watchedAt: 20260825,
    },
  },
  {
    name: "a diary year below the lower bound",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1870,
      rating: 4,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a diary year above the upper bound",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 2100,
      rating: 4,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a fractional diary year",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922.5,
      rating: 4,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a diary rating below the lower bound",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: 0,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a diary rating above the upper bound",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: 6,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "a fractional diary rating",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: 4.5,
      watchedAt: "2026-08-25",
    },
  },
  {
    name: "an invalid diary calendar date",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: 4,
      watchedAt: "25/08/2026",
    },
  },
  {
    name: "a diary date on a non-leap February 29",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: 4,
      watchedAt: "2025-02-29",
    },
  },
  {
    name: "a diary date on February 30",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: 4,
      watchedAt: "2024-02-30",
    },
  },
  {
    name: "a diary date in month zero",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: 4,
      watchedAt: "2024-00-15",
    },
  },
  {
    name: "a diary date in month thirteen",
    value: {
      type: "import-diary-row",
      viewerId: "viewer-1",
      name: "Nosferatu",
      year: 1922,
      rating: 4,
      watchedAt: "2024-13-15",
    },
  },
  {
    name: "a non-boolean match chain flag",
    value: { type: "match-revival-works", chain: "yes" },
  },
  {
    name: "a non-boolean recheck chain flag",
    value: { type: "recheck-revival-works", chain: 1 },
  },
  { name: "a negative anime offset", value: { type: "import-anime-ids", offset: -1 } },
  { name: "a fractional anime offset", value: { type: "import-anime-ids", offset: 0.5 } },
  { name: "a non-boolean anime force flag", value: { type: "import-anime-ids", force: 1 } },
  { name: "an invalid enrichment title ID", value: { type: "enrich-ratings", titleId: "tv:0" } },
] as const;

test("accepts every ingestion job discriminator", async (context) => {
  await Promise.all(
    validJobs.map((job) =>
      context.test(job.type, () => {
        assert.equal(isIngestionJob(job), true);
      }),
    ),
  );
});

test("rejects malformed and out-of-bounds ingestion jobs", async (context) => {
  await Promise.all(
    malformedJobs.map((malformed) =>
      context.test(malformed.name, () => {
        assert.equal(isIngestionJob(malformed.value), false);
      }),
    ),
  );
});
