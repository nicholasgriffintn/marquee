import type { MediaTitle } from "../../src/domain/catalog.ts";
import { getJikanDetails } from "../clients/jikan.ts";
import {
  getOmdbTitle,
  searchOmdb,
  type OmdbRecord,
  type OmdbSearchResult,
} from "../clients/omdb.ts";
import { logEvent } from "../lib/logging.ts";
import { enqueue } from "../lib/queue.ts";
import { comparableTitle, imdbIdFrom } from "../lib/text.ts";
import { claimBudget, isUpstreamDown, readBudgetRoom } from "../repositories/budgets.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import {
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

const RUN_STATUS: Record<string, string> = {
  "Finished Airing": "Ended",
  "Currently Airing": "Returning Series",
  "Not yet aired": "Planned",
};
const YEAR_SLACK = 2;

const ENRICHERS = [
  { source: "omdb", job: "enrich-ratings", maxAgeDays: 30, perRun: 3_000, budgetGated: true },
  { source: "poster", job: "cache-poster", maxAgeDays: 365, perRun: 2_000, budgetGated: false },
  { source: "jikan", job: "enrich-anime", maxAgeDays: 14, perRun: 120, budgetGated: true },
] as const satisfies readonly {
  source: EnrichmentSource;
  job: IngestionJob["type"];
  maxAgeDays: number;
  perRun: number;
  budgetGated: boolean;
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

function sourceCandidates(
  env: Bindings,
  source: EnrichmentSource,
  maxAgeDays: number,
  perRun: number,
) {
  return source === "jikan"
    ? selectAnimeCandidates(env, maxAgeDays, perRun)
    : selectUnenriched(env, source, maxAgeDays, perRun);
}

function sourceConfigured(env: Bindings, source: EnrichmentSource) {
  if (source === "omdb" || source === "poster") {
    return Boolean(env.OMDB_API_KEY);
  }

  return source === "jikan";
}

function enrichmentRoom(env: Bindings, enricher: Enricher) {
  return enricher.budgetGated
    ? readBudgetRoom(env, enricher.source)
    : Promise.resolve(enricher.perRun);
}

export async function queueEnrichment(env: Bindings) {
  for (const enricher of ENRICHERS) {
    if (!sourceConfigured(env, enricher.source)) {
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const room = await enrichmentRoom(env, enricher);

    if (room <= 0) {
      logEvent("enrichment_skipped", { source: enricher.source });

      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const titleIds = await sourceCandidates(
      env,
      enricher.source,
      enricher.maxAgeDays,
      Math.min(enricher.perRun, room),
    );

    logEvent("enrichment_queued", { source: enricher.source, count: titleIds.length, room });

    // oxlint-disable-next-line no-await-in-loop
    await enqueue(
      enrichmentQueue(env, enricher.source),
      titleIds.map((titleId): IngestionJob => ({ type: enricher.job, titleId })),
    );
  }
}

function searchNames(title: MediaTitle) {
  const names = [title.title];

  if (
    title.originalTitle &&
    comparableTitle(title.originalTitle) !== comparableTitle(title.title)
  ) {
    names.push(title.originalTitle);
  }

  return names;
}

function comparableNames(title: MediaTitle) {
  return new Set(searchNames(title).map((name) => comparableTitle(name)));
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
    getOmdbTitle(env, { title: title.title, year: title.year, mediaType: title.mediaType }),
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
): Promise<SourceAttempt<OmdbRecord | null>> {
  let found: OmdbSearchResult | null = null;

  for (const name of searchNames(title)) {
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

async function resolveOmdbRecord(env: Bindings, title: MediaTitle) {
  const known = imdbIdFrom(title.imdbUrl);

  if (known) {
    return lookup(env, () => getOmdbTitle(env, { imdbId: known }));
  }

  const named = await findByName(env, title);

  if (named.limited || named.value) {
    return named;
  }

  return findBySearch(env, title);
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

  const attempt = await resolveOmdbRecord(env, title);

  if (attempt.limited) {
    await storeEnrichmentTransient(env, titleId, "omdb", "rate-limited");

    return;
  }

  const record = attempt.value;

  if (!record) {
    await storeEnrichmentMiss(env, titleId, "omdb", "no-omdb-record");

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
    await storeEnrichmentMiss(env, titleId, "jikan", "no-mal-id");

    return;
  }

  if (!(await claimBudget(env, "jikan"))) {
    logEvent("budget_exhausted", { source: "jikan", titleId });

    return;
  }

  const attempt = await withRateLimitPause(env, "jikan", async () => {
    try {
      return await getJikanDetails(malId);
    } catch (error) {
      if (!isUpstreamDown(error)) {
        throw error;
      }

      return "unavailable" as const;
    }
  });

  if (attempt.limited) {
    await storeEnrichmentTransient(env, titleId, "jikan", "rate-limited");

    return;
  }

  const details = attempt.value;

  if (details === "unavailable") {
    await storeEnrichmentTransient(env, titleId, "jikan", "mal-unavailable");

    return;
  }

  if (!details) {
    await storeEnrichmentMiss(env, titleId, "jikan", "no-mal-record");

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

  await storeEnrichment(env, titleId, "jikan", {
    anime: {
      ...details.anime,
      broadcast: details.broadcast,
      background: details.background,
      licensors: details.licensors,
      producers: details.producers,
      rank: details.rank,
      members: details.members,
      favorites: details.favorites,
      keyVisualUrl: details.keyVisualUrl,
      trailerKey: details.trailerKey,
      links: details.links,
    },
    keywords,
    ...(title?.status || !RUN_STATUS[details.status ?? ""]
      ? {}
      : { status: RUN_STATUS[details.status ?? ""] }),
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
