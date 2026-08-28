import type { AnimeDetails, MediaTitle } from "../../src/domain/catalog.ts";
import { buildTitleFromRow, type CatalogTitleRow } from "../lib/catalog-payload.ts";
import { readAnimeCoreMap, writeAnimeCoreRows } from "./catalog-anime-core.ts";
import {
  readAnimeCompanyMap,
  writeAnimeCompanyRows,
  readAnimeSynonymMap,
  writeAnimeSynonymRows,
} from "./catalog-anime-lists.ts";
import {
  readAnimeStreamMap,
  writeAnimeStreamRows,
  readAnimeThemeMap,
  writeAnimeThemeRows,
  readAnimeVideoMap,
  writeAnimeVideoRows,
} from "./catalog-anime-media.ts";
import {
  readAnimeCharacterMap,
  writeAnimeCharacterRows,
  readAnimeStaffMap,
  writeAnimeStaffRows,
} from "./catalog-anime-people.ts";
import {
  readAnimeLinkMap,
  writeAnimeLinkRows,
  readAnimeRecommendationMap,
  writeAnimeRecommendationRows,
  readAnimeRelationMap,
  writeAnimeRelationRows,
} from "./catalog-anime-relations.ts";
import { readCountryMap, writeCountryRows } from "./catalog-countries.ts";
import { readDetailsMap, writeDetailsRows } from "./catalog-details.ts";
import { readExternalIdsMap, writeExternalIdsRows } from "./catalog-external-ids.ts";
import { readGenreMap, writeGenreRows } from "./catalog-genres.ts";
import { readKeywordMap, writeKeywordRows } from "./catalog-keywords.ts";
import { readLanguageMap, writeLanguageRows } from "./catalog-languages.ts";
import { readPersonMap, writePersonRows } from "./catalog-people.ts";
import { readProviderMap, writeProviderRows } from "./catalog-providers.ts";
import { readRatingsMap, writeRatingsRows } from "./catalog-ratings.ts";
import { readRecommendationMap, writeRecommendationRows } from "./catalog-recommendations.ts";
import { readStudioMap, writeStudioRows } from "./catalog-studios.ts";
import { readVideoMap, writeVideoRows } from "./catalog-videos.ts";
import { readVisualFormatMap } from "./title-visual-format.ts";

async function attachAnime(db: D1Database, ids: string[]) {
  const core = await readAnimeCoreMap(db, ids);

  if (core.size === 0) {
    return new Map<string, AnimeDetails>();
  }

  const animeIds = [...core.keys()];
  const [synonyms, companies, streams, themes, videos, characters, staff, relations, recs, links] =
    await Promise.all([
      readAnimeSynonymMap(db, animeIds),
      readAnimeCompanyMap(db, animeIds),
      readAnimeStreamMap(db, animeIds),
      readAnimeThemeMap(db, animeIds),
      readAnimeVideoMap(db, animeIds),
      readAnimeCharacterMap(db, animeIds),
      readAnimeStaffMap(db, animeIds),
      readAnimeRelationMap(db, animeIds),
      readAnimeRecommendationMap(db, animeIds),
      readAnimeLinkMap(db, animeIds),
    ]);

  const result = new Map<string, AnimeDetails>();

  for (const [titleId, base] of core) {
    const company = companies.get(titleId);
    const theme = themes.get(titleId);

    result.set(titleId, {
      ...base,
      synonyms: synonyms.get(titleId) ?? [],
      relations: relations.get(titleId) ?? [],
      streams: streams.get(titleId) ?? [],
      characters: characters.get(titleId) ?? [],
      staff: staff.get(titleId) ?? [],
      openings: theme?.openings ?? [],
      endings: theme?.endings ?? [],
      licensors: company?.licensors ?? [],
      producers: company?.producers ?? [],
      videos: videos.get(titleId) ?? [],
      recommendations: recs.get(titleId) ?? [],
      links: links.get(titleId) ?? [],
    });
  }

  return result;
}

async function persistAnime(db: D1Database, titles: MediaTitle[]) {
  await writeAnimeCoreRows(db, titles);
  await writeAnimeSynonymRows(db, titles);
  await writeAnimeCompanyRows(db, titles);
  await writeAnimeStreamRows(db, titles);
  await writeAnimeThemeRows(db, titles);
  await writeAnimeVideoRows(db, titles);
  await writeAnimeCharacterRows(db, titles);
  await writeAnimeStaffRows(db, titles);
  await writeAnimeRelationRows(db, titles);
  await writeAnimeRecommendationRows(db, titles);
  await writeAnimeLinkRows(db, titles);
}

export async function attachTitleExtensions<T extends MediaTitle>(
  db: D1Database,
  titles: T[],
): Promise<T[]> {
  if (titles.length === 0) {
    return titles;
  }

  const ids = [...new Set(titles.map((title) => title.id))];
  const [
    genres,
    keywords,
    studios,
    people,
    recommendationIds,
    countries,
    languages,
    videos,
    providers,
    ratings,
    externalIds,
    details,
    visualFormat,
    anime,
  ] = await Promise.all([
    readGenreMap(db, ids),
    readKeywordMap(db, ids),
    readStudioMap(db, ids),
    readPersonMap(db, ids),
    readRecommendationMap(db, ids),
    readCountryMap(db, ids),
    readLanguageMap(db, ids),
    readVideoMap(db, ids),
    readProviderMap(db, ids),
    readRatingsMap(db, ids),
    readExternalIdsMap(db, ids),
    readDetailsMap(db, ids),
    readVisualFormatMap(db, ids),
    attachAnime(db, ids),
  ]);

  return titles.map((title) => {
    const detail = details.get(title.id);
    const externalId = externalIds.get(title.id);

    return {
      ...title,
      genres: genres.get(title.id) ?? [],
      keywords: keywords.get(title.id) ?? [],
      studios: studios.get(title.id) ?? [],
      people: people.get(title.id) ?? [],
      recommendationIds: recommendationIds.get(title.id) ?? [],
      countries: countries.get("countries")?.get(title.id) ?? [],
      originCountries: countries.get("originCountries")?.get(title.id) ?? [],
      productionCountries: countries.get("productionCountries")?.get(title.id) ?? [],
      languages: languages.get("languages")?.get(title.id) ?? [],
      spokenLanguages: languages.get("spokenLanguages")?.get(title.id) ?? [],
      videos: videos.get(title.id),
      providers: providers.get(title.id) ?? [],
      ratings: ratings.get(title.id),
      homepage: detail?.homepage,
      trailerKey: detail?.trailerKey,
      tagline: detail?.tagline,
      budget: detail?.budget,
      episodeCount: detail?.episodeCount,
      lastAirDate: detail?.lastAirDate,
      nextAirDate: detail?.nextAirDate,
      pending: detail?.pending,
      visualFormat: visualFormat.get(title.id),
      externalIds: externalId ? { ...title.externalIds, ...externalId } : title.externalIds,
      anime: anime.get(title.id),
    } satisfies MediaTitle;
  });
}

export function hydrateTitleRows(db: D1Database, rows: CatalogTitleRow[]) {
  return attachTitleExtensions(
    db,
    rows.map((row) => buildTitleFromRow(row)),
  );
}

export async function persistTitleExtensions(db: D1Database, titles: MediaTitle[]) {
  if (titles.length === 0) {
    return;
  }

  await writeGenreRows(db, titles);
  await writeKeywordRows(db, titles);
  await writeStudioRows(db, titles);
  await writePersonRows(db, titles);
  await writeRecommendationRows(db, titles);
  await writeCountryRows(db, titles);
  await writeLanguageRows(db, titles);
  await writeVideoRows(db, titles);
  await writeProviderRows(db, titles);
  await writeRatingsRows(db, titles);
  await writeExternalIdsRows(db, titles);
  await writeDetailsRows(db, titles);
  await persistAnime(db, titles);
}
