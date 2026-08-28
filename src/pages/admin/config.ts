import type { AdminAction } from "../../hooks/useAdmin";

export const TABS = [
  { id: "overview", label: "Overview" },
  { id: "actions", label: "Actions" },
  { id: "pipeline", label: "Pipeline" },
  { id: "listings", label: "Listings" },
  { id: "vault", label: "The vault" },
  { id: "people", label: "People" },
] as const;

export type AdminTab = (typeof TABS)[number]["id"];

export const READS_DATA = new Set<AdminTab>([
  "overview",
  "pipeline",
  "listings",
  "vault",
  "people",
]);

export const RUN_STATUSES = ["all", "completed", "failed", "running"] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const PEOPLE_SEARCH_FROM = 8;

export const ACTION_GROUPS: {
  title: string;
  note: string;
  actions: { id: AdminAction; label: string }[];
}[] = [
  {
    title: "Schedules",
    note: "The same workflows the crons start. A light sweep runs every three hours, a deep sweep nightly, the digest on Monday mornings. Every sweep advances the catalogue backfill by a bounded number of pages.",
    actions: [
      { id: "sweep-light", label: "Run light sweep" },
      { id: "sweep-deep", label: "Run deep sweep" },
      { id: "digest", label: "Rebuild digests" },
    ],
  },
  {
    title: "Backfills",
    note: "Queue work without waiting for a sweep. Each one respects the call budgets below. The backfill walks TMDB in dated windows, so every run picks up where the last one stopped.",
    actions: [
      { id: "catalog-head", label: "Sync latest titles" },
      { id: "availability", label: "Refresh availability" },
      { id: "enrichment", label: "Queue enrichment" },
      { id: "embeddings", label: "Queue embeddings" },
      { id: "discover", label: "Advance backfill" },
      { id: "anime-ids", label: "Import anime ids" },
    ],
  },
  {
    title: "Enrichment by source",
    note: "The same queue as 'Queue enrichment', narrowed to one upstream. Each still respects that source's own daily budget and only picks up titles that are actually due, so pressing one twice in a row queues nothing the second time.",
    actions: [
      { id: "enrichment-omdb", label: "Ratings (OMDb)" },
      { id: "enrichment-poster", label: "Posters (OMDb)" },
      { id: "enrichment-mal", label: "Anime detail (MAL)" },
      { id: "enrichment-anilist", label: "Streams and cast (AniList)" },
    ],
  },
  {
    title: "Rebuilds",
    note: "Fast jobs that go straight onto the ingestion queue.",
    actions: [
      { id: "sections", label: "Rebuild homepage" },
      { id: "working-set", label: "Rebuild working set" },
      { id: "schedule", label: "Refresh air dates" },
      { id: "buzz", label: "Refresh trending" },
      { id: "providers", label: "Refresh providers" },
    ],
  },
  {
    title: "The post",
    note: "Alerts only go to members who have confirmed an address, never more than a handful a week, and never twice about the same thing. Preview runs every detector and reports what would go out without posting anything.",
    actions: [
      { id: "alerts-preview", label: "Preview the post" },
      { id: "alerts-send", label: "Send the post" },
      { id: "angle-scores", label: "Rescore shelves" },
      { id: "people", label: "Reindex credits" },
    ],
  },
  {
    title: "The revival house",
    note: "Public domain prints from European archives, the Internet Archive, the Library of Congress and Wikimedia Commons. The UK term runs 70 years from the death of the last author, so a work is matched to the catalogue, checked against Wikidata for its authors' death dates, and only then cleared. Commons prints arrive having already cleared that test. Descriptions come from Wikipedia and are shown with attribution. Everything unresolved waits in the queue below. Mirroring copies an approved print into our own bucket, one chunk per run.",
    actions: [
      { id: "revival-sweep", label: "Sweep the sources" },
      { id: "revival-match", label: "Match to catalogue" },
      { id: "revival-describe", label: "Describe from Wikipedia" },
      { id: "revival-rights", label: "Check UK rights" },
      { id: "revival-mirror", label: "Mirror approved prints" },
    ],
  },
  {
    title: "The other houses",
    note: "Cinema listings come from the chains that publish them. The directory is refreshed on a deep sweep; listings are only pulled for cinemas near somewhere a member has actually looked from, so the work grows with the audience rather than with the country.",
    actions: [
      { id: "cinemas", label: "Refresh cinema directory" },
      { id: "showtimes", label: "Pull local listings" },
    ],
  },
];

export const COUNT_LABELS: { key: string; label: string }[] = [
  { key: "titles", label: "titles" },
  { key: "movies", label: "films" },
  { key: "shows", label: "series" },
  { key: "workingSet", label: "tracked for availability" },
  { key: "availabilityFresh", label: "availability fresh" },
  { key: "embeddings", label: "embedded" },
  { key: "posters", label: "posters cached" },
  { key: "buzz", label: "buzz measured" },
  { key: "upcoming", label: "episodes ahead" },
  { key: "sections", label: "homepage rails" },
  { key: "people", label: "people indexed" },
  { key: "seasons", label: "seasons recorded" },
  { key: "insights", label: "titles with insight" },
  { key: "animeIds", label: "anime ids matched" },
  { key: "animeDetails", label: "anime detail fetched" },
  { key: "revivalWorks", label: "revival prints found" },
  { key: "revivalApproved", label: "revival prints showing" },
  { key: "revivalMirrored", label: "revival prints we hold" },
  { key: "revivalPending", label: "revival prints unreviewed" },
  { key: "railSets", label: "viewers with shelves built" },
  { key: "pinnedShelves", label: "shelves pinned" },
  { key: "cinemas", label: "cinemas" },
  { key: "cinemasPlaced", label: "cinemas placed" },
  { key: "cinemaFilms", label: "cinema films" },
  { key: "screenings", label: "screenings ahead" },
  { key: "interestCells", label: "places looked from" },
  { key: "users", label: "accounts" },
  { key: "alertReady", label: "confirmed addresses" },
  { key: "alertsWeek", label: "alerts this week" },
  { key: "alertsSent", label: "alerts all time" },
  { key: "signals", label: "signals recorded" },
  { key: "beliefs", label: "beliefs held" },
];
