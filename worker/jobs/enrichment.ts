import type { MediaTitle } from "../../src/domain/catalog.ts";
import { getAniListDetails } from "../clients/anilist.ts";
import { getMalAnimeDetails } from "../clients/myanimelist.ts";
import {
  getOmdbTitle,
  searchOmdb,
  type OmdbRecord,
  type OmdbSearchResult,
} from "../clients/omdb.ts";
import { isLocalDev } from "../lib/environment.ts";
import { logError, logEvent } from "../lib/logging.ts";
import { enqueue } from "../lib/queue.ts";
import { comparableTitle, imdbIdFrom } from "../lib/text.ts";
import { claimBudget, isRateLimited, isRefused, readBudgetPace } from "../repositories/budgets.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import {
  ENRICHMENT_WINDOWS,
  selectAniListCandidates,
  selectAnimeCandidates,
  selectUnenriched,
  storeEnrichment,
  storeEnrichmentMiss,
  storeEnrichmentTransient,
  storeImdbId,
} from "../repositories/enrichment.ts";
import type { Bindings, EnrichmentSource, IngestionJob } from "../types.ts";
import { withRateLimitPause, type SourceAttempt } from "./sources.ts";

const ANIME_KEYWORD_LIMIT = 60;
const LOCAL_DEV_PER_RUN_CAP = 500;

const RUN_STATUS: Record<string, string> = {
  "Finished Airing": "Ended",
  "Currently Airing": "Returning Series",
  "Not yet aired": "Planned",
};
const YEAR_SLACK = 2;
const LATIN_SCRIPT = /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]+$/u;

// maxAgeDays/missBackoffDays come from ENRICHMENT_WINDOWS (worker/repositories/enrichment.ts),
// the single source of truth also used to compute next_check_at at write time — keeping them
// here in sync via spread avoids the read and write windows drifting apart.
const ENRICHERS = [
  {
    source: "omdb",
    job: "enrich-ratings",
    ...ENRICHMENT_WINDOWS.omdb,
    perRun: 20_000,
    share: 0.7,
  },
  {
    source: "poster",
    job: "cache-poster",
    ...ENRICHMENT_WINDOWS.poster,
    perRun: 10_000,
    share: 0.3,
  },
  {
    source: "mal",
    job: "enrich-anime",
    ...ENRICHMENT_WINDOWS.mal,
    perRun: 120,
    share: 1,
  },
  {
    source: "anilist",
    job: "enrich-anilist-media",
    ...ENRICHMENT_WINDOWS.anilist,
    perRun: 500,
    share: 1,
  },
] as const satisfies readonly {
  source: EnrichmentSource;
  job: IngestionJob["type"];
  maxAgeDays: number;
  missBackoffDays: number;
  perRun: number;
  share: number;
}[];

type Enricher = (typeof ENRICHERS)[number];

function enrichmentQueue(env: Bindings, source: EnrichmentSource) {
  if (source === "omdb") {
    return env.RATINGS_QUEUE;
  }

  if (source === "poster") {
    return env.POSTER_QUEUE;
  }

  return env.ANIME_QUEUE;
}

function sourceCandidates(env: Bindings, enricher: Enricher, limit: number) {
  if (enricher.source === "mal") {
    return selectAnimeCandidates(env, limit);
  }

  if (enricher.source === "anilist") {
    return selectAniListCandidates(env, limit);
  }

  return selectUnenriched(env, enricher.source, limit);
}

function sourceConfigured(env: Bindings, source: EnrichmentSource) {
  if (source === "omdb" || source === "poster") {
    return Boolean(env.OMDB_API_KEY);
  }

  if (source === "mal") {
    return Boolean(env.MAL_CLIENT_ID);
  }

  return true;
}

async function enrichmentRoom(env: Bindings, enricher: Enricher) {
  const pace = await readBudgetPace(env, enricher.source);

  return Math.floor(pace * enricher.share);
}

export async function queueEnrichment(env: Bindings, only?: EnrichmentSource) {
  const queued: Partial<Record<EnrichmentSource, number>> = {};

  for (const enricher of ENRICHERS) {
    if (only && enricher.source !== only) {
      continue;
    }

    if (!sourceConfigured(env, enricher.source)) {
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const room = await enrichmentRoom(env, enricher);

    if (room <= 0) {
      logEvent("enrichment_skipped", { source: enricher.source });
      queued[enricher.source] = 0;

      continue;
    }

    const limit = isLocalDev(env)
      ? Math.min(enricher.perRun, room, LOCAL_DEV_PER_RUN_CAP)
      : Math.min(enricher.perRun, room);

    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await sourceCandidates(env, enricher, limit);

    logEvent("enrichment_queued", {
      source: enricher.source,
      count: titleIds.length,
      room,
    });

    // oxlint-disable-next-line no-await-in-loop
    await enqueue(
      enrichmentQueue(env, enricher.source),
      titleIds.map((titleId): IngestionJob => ({
        type: enricher.job,
        titleId,
      })),
    );

    queued[enricher.source] = titleIds.length;
  }

  return queued;
}

function latinName(name: string) {
  return name.length > 0 && LATIN_SCRIPT.test(name);
}

function searchNames(title: MediaTitle) {
  const names = [title.title];

  if (
    title.originalTitle &&
    comparableTitle(title.originalTitle) !== comparableTitle(title.title)
  ) {
    names.push(title.originalTitle);
  }

  return names.filter((name) => latinName(name));
}

function comparableNames(title: MediaTitle) {
  return new Set(
    [title.title, title.originalTitle]
      .filter((name): name is string => Boolean(name))
      .map((name) => comparableTitle(name))
      .filter(Boolean),
  );
}

function yearMatches(wanted: number | null, found: number | null) {
  return !wanted || !found || Math.abs(found - wanted) <= YEAR_SLACK;
}

function yearGap(wanted: number | null, found: number | null) {
  return wanted && found ? Math.abs(found - wanted) : YEAR_SLACK;
}

async function lookup(
  env: Bindings,
  run: () => Promise<OmdbRecord | null>,
): Promise<SourceAttempt<OmdbRecord | null>> {
  if (!(await claimBudget(env, "omdb"))) {
    logEvent("budget_exhausted", { source: "omdb" });

    return { limited: true };
  }

  return withRateLimitPause(env, "omdb", run);
}

async function findByName(
  env: Bindings,
  title: MediaTitle,
): Promise<SourceAttempt<OmdbRecord | null>> {
  const attempt = await lookup(env, () =>
    getOmdbTitle(env, {
      title: title.title,
      year: title.year,
      mediaType: title.mediaType,
    }),
  );

  if (attempt.limited) {
    return attempt;
  }

  const record = attempt.value;
  const named = record?.imdbId ? comparableNames(title).has(comparableTitle(record.title)) : false;

  return { limited: false, value: named ? record : null };
}

function bestMatch(title: MediaTitle, results: OmdbSearchResult[]) {
  const names = comparableNames(title);
  const named = results.filter(
    (result) => names.has(comparableTitle(result.title)) && yearMatches(title.year, result.year),
  );

  return named.reduce<OmdbSearchResult | null>(
    (best, result) =>
      !best || yearGap(title.year, result.year) < yearGap(title.year, best.year) ? result : best,
    null,
  );
}

async function searchFor(
  env: Bindings,
  title: MediaTitle,
  query: string,
): Promise<SourceAttempt<OmdbSearchResult | null>> {
  if (!(await claimBudget(env, "omdb"))) {
    return { limited: true };
  }

  const attempt = await withRateLimitPause(env, "omdb", () =>
    searchOmdb(env, query, { mediaType: title.mediaType }),
  );

  return attempt.limited ? attempt : { limited: false, value: bestMatch(title, attempt.value) };
}

async function findBySearch(
  env: Bindings,
  title: MediaTitle,
  names: string[],
): Promise<SourceAttempt<OmdbRecord | null>> {
  if (!title.year) {
    return { limited: false, value: null };
  }

  let found: OmdbSearchResult | null = null;

  for (const name of names) {
    // oxlint-disable-next-line no-await-in-loop
    const attempt = await searchFor(env, title, name);

    if (attempt.limited) {
      return attempt;
    }

    if (attempt.value) {
      found = attempt.value;

      break;
    }
  }

  const match = found;

  if (!match) {
    return { limited: false, value: null };
  }

  return lookup(env, () => getOmdbTitle(env, { imdbId: match.imdbId }));
}

async function resolveOmdbRecord(
  env: Bindings,
  title: MediaTitle,
): Promise<SourceAttempt<OmdbRecord | null>> {
  const known = imdbIdFrom(title.imdbUrl);

  if (known) {
    return lookup(env, () => getOmdbTitle(env, { imdbId: known }));
  }

  const names = searchNames(title);

  if (names.length === 0) {
    return { limited: false, value: null };
  }

  const named = await findByName(env, title);

  if (named.limited || named.value) {
    return named;
  }

  return findBySearch(env, title, names);
}

function omdbFields(title: MediaTitle, record: OmdbRecord) {
  const facts = record.facts;

  return {
    ratings: {
      ...record.ratings,
      animeScore: title.ratings?.animeScore ?? null,
      animeVotes: title.ratings?.animeVotes ?? null,
    },
    ...(title.certification || !facts.certification ? {} : { certification: facts.certification }),
    ...(title.runtimeMinutes || !facts.runtimeMinutes
      ? {}
      : { runtimeMinutes: facts.runtimeMinutes }),
    ...(title.genres.length > 0 || facts.genres.length === 0 ? {} : { genres: facts.genres }),
    ...(title.releaseDate || !facts.releaseDate ? {} : { releaseDate: facts.releaseDate }),
    ...(title.year || !record.year ? {} : { year: record.year }),
    ...(title.overview.trim() || !facts.plot ? {} : { overview: facts.plot }),
    ...(title.people?.length || facts.people.length === 0 ? {} : { people: facts.people }),
    ...(title.studios?.length || facts.studios.length === 0 ? {} : { studios: facts.studios }),
    ...(facts.countries.length > 0 ? { countries: facts.countries } : {}),
    ...(facts.languages.length > 0 ? { languages: facts.languages } : {}),
    ...(title.numberOfSeasons || !facts.numberOfSeasons
      ? {}
      : { numberOfSeasons: facts.numberOfSeasons }),
    ...(title.posterUrl || !facts.posterUrl ? {} : { posterUrl: facts.posterUrl }),
  };
}

export async function enrichRatings(env: Bindings, titleId: string) {
  if (!env.OMDB_API_KEY) {
    return;
  }

  const [title] = await readItems(env.DB, [titleId]);

  if (!title) {
    await storeEnrichmentMiss(env, titleId, "omdb", "no-title-row");

    return;
  }

  let attempt: SourceAttempt<OmdbRecord | null>;

  try {
    attempt = await resolveOmdbRecord(env, title);
  } catch (error) {
    logError("omdb_lookup_failed", error, { titleId });
    await storeEnrichmentTransient(env, titleId, "omdb", "upstream-error");

    return;
  }

  if (attempt.limited) {
    await storeEnrichmentTransient(env, titleId, "omdb", "rate-limited");

    return;
  }

  const record = attempt.value;

  if (!record) {
    const reason =
      imdbIdFrom(title.imdbUrl) || searchNames(title).length > 0
        ? "no-omdb-record"
        : "unsearchable-title";

    await storeEnrichmentMiss(env, titleId, "omdb", reason);

    return;
  }

  if (record.imdbId && !imdbIdFrom(title.imdbUrl)) {
    await storeImdbId(env.DB, titleId, record.imdbId);

    logEvent("imdb_id_recovered", { titleId, imdbId: record.imdbId });
  }

  await storeEnrichment(env, titleId, "omdb", omdbFields(title, record));
}

export async function enrichAnime(env: Bindings, titleId: string) {
  const [title] = await readItems(env.DB, [titleId]);
  const malId = title?.externalIds?.malId ?? null;

  if (!malId) {
    await storeEnrichmentMiss(env, titleId, "mal", "no-mal-id");

    return;
  }

  if (!(await claimBudget(env, "mal"))) {
    logEvent("budget_exhausted", { source: "mal", titleId });

    return;
  }

  const attempt = await withRateLimitPause(env, "mal", async () => {
    try {
      return await getMalAnimeDetails(env, malId);
    } catch (error) {
      if (isRefused(error) || isRateLimited(error)) {
        throw error;
      }

      logError("mal_lookup_failed", error, { titleId });

      return "unavailable" as const;
    }
  });

  if (attempt.limited) {
    await storeEnrichmentTransient(env, titleId, "mal", "rate-limited");

    return;
  }

  const details = attempt.value;

  if (details === "unavailable") {
    await storeEnrichmentTransient(env, titleId, "mal", "mal-unavailable");

    return;
  }

  if (!details) {
    await storeEnrichmentMiss(env, titleId, "mal", "no-mal-record");

    return;
  }

  const searchable = [
    ...details.anime.synonyms,
    details.anime.romajiTitle,
    details.anime.englishTitle,
    details.anime.nativeTitle,
  ]
    .filter((name): name is string => Boolean(name))
    .map((name) => name.toLowerCase());
  const material = details.anime.source
    ? [`source:${details.anime.source.toLowerCase().replaceAll("_", "-")}`]
    : [];
  const keywords = [
    ...new Set([
      ...(title?.keywords ?? []),
      ...details.tags,
      ...details.studios.map((studio) => studio.toLowerCase()),
      ...searchable,
      ...material,
    ]),
  ].slice(0, ANIME_KEYWORD_LIMIT);

  await storeEnrichment(env, titleId, "mal", {
    anime: {
      ...title?.anime,
      ...details.anime,
      broadcast: details.broadcast,
      background: details.background,
      rank: details.rank,
      popularity: details.popularity,
      members: details.members,
      favorites: details.favorites,
      keyVisualUrl: details.keyVisualUrl,
      videos: details.videos,
      statusBreakdown: details.statusBreakdown,
    },
    keywords,
    ...(title?.status || !RUN_STATUS[details.status ?? ""]
      ? {}
      : { status: RUN_STATUS[details.status ?? ""] }),
    ...(title?.certification || !details.rating ? {} : { certification: `MAL ${details.rating}` }),
    ...(title?.lastAirDate || !details.airedTo ? {} : { lastAirDate: details.airedTo }),
    ...(title?.studios?.length || details.studios.length === 0 ? {} : { studios: details.studios }),
    ...(title?.posterUrl || !details.keyVisualUrl ? {} : { posterUrl: details.keyVisualUrl }),
    ratings: {
      imdbScore: title?.ratings?.imdbScore ?? null,
      imdbVotes: title?.ratings?.imdbVotes ?? null,
      rottenTomatoes: title?.ratings?.rottenTomatoes ?? null,
      metascore: title?.ratings?.metascore ?? null,
      awards: title?.ratings?.awards ?? null,
      awardWins: title?.ratings?.awardWins ?? null,
      boxOffice: title?.ratings?.boxOffice ?? null,
      animeScore: details.score,
      animeVotes: details.scoredBy,
    },
  });
}

export async function enrichAniListMedia(env: Bindings, titleId: string) {
  const [title] = await readItems(env.DB, [titleId]);
  const anilistId = title?.externalIds?.anilistId ?? null;

  if (!anilistId) {
    await storeEnrichmentMiss(env, titleId, "anilist", "no-anilist-id");

    return;
  }

  if (!(await claimBudget(env, "anilist"))) {
    logEvent("budget_exhausted", { source: "anilist", titleId });

    return;
  }

  const attempt = await withRateLimitPause(env, "anilist", async () => {
    try {
      return await getAniListDetails(anilistId);
    } catch (error) {
      if (isRefused(error) || isRateLimited(error)) {
        throw error;
      }

      logError("anilist_lookup_failed", error, { titleId });

      return "unavailable" as const;
    }
  });

  if (attempt.limited) {
    await storeEnrichmentTransient(env, titleId, "anilist", "rate-limited");

    return;
  }

  const details = attempt.value;

  if (details === "unavailable") {
    await storeEnrichmentTransient(env, titleId, "anilist", "anilist-unavailable");

    return;
  }

  if (!details) {
    await storeEnrichmentMiss(env, titleId, "anilist", "no-anilist-record");

    return;
  }

  await storeEnrichment(env, titleId, "anilist", {
    anime: title?.anime
      ? { ...title.anime, ...details }
      : {
          format: null,
          episodes: null,
          durationMinutes: null,
          season: null,
          seasonYear: null,
          source: null,
          synonyms: [],
          romajiTitle: null,
          englishTitle: null,
          nativeTitle: null,
          relations: [],
          ...details,
        },
  });
}
