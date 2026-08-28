import type { MediaType } from "../../src/domain/catalog.ts";
import type { PlaceKind } from "../../src/domain/places.ts";
import { tmdbBranches, tmdbKey } from "../lib/wikidata-refs.ts";
import { entityIdFrom, queryWikidata } from "./wikidata-query.ts";

const TIMEOUT_MS = 30_000;
const CACHE_TTL = 2_592_000;
const BATCH = 20;
const COUNTRY_BATCH = 120;
const DETAIL_BATCH = 120;
const LABEL_LIMIT = 90;
const WIDEST_DEGREES = 1;

export type PlaceRef = {
  key: string;
  wikidataId: string | null;
  mediaType: MediaType;
  tmdbId: number | null;
};

export type PlaceRecord = {
  entityId: string;
  label: string;
  latitude: number;
  longitude: number;
  precisionDegrees: number;
  countryId: string | null;
};

export type TitlePlaceRow = { key: string; kind: PlaceKind; place: PlaceRecord };

export type TitlePlaceResult = { rows: TitlePlaceRow[]; countries: PlaceRecord[] };

function clauses(refs: PlaceRef[]) {
  const byTmdb = refs.flatMap((ref) =>
    ref.tmdbId ? [{ mediaType: ref.mediaType, tmdbId: ref.tmdbId }] : [],
  );

  return tmdbBranches(byTmdb, {
    subject: "film",
    key: "tmdbKey",
    entities: refs.flatMap((ref) => (ref.wikidataId && !ref.tmdbId ? [ref.wikidataId] : [])),
  });
}

function coordinate(value: string | undefined, limit: number) {
  const parsed = Number.parseFloat(value ?? "");

  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
}

function placeRecord(row: {
  entity: string | undefined;
  label: string | undefined;
  latitude: string | undefined;
  longitude: string | undefined;
  precision: string | undefined;
  country: string | undefined;
}): PlaceRecord | null {
  const entityId = entityIdFrom(row.entity);
  const label = row.label?.trim().slice(0, LABEL_LIMIT);
  const latitude = coordinate(row.latitude, 90);
  const longitude = coordinate(row.longitude, 180);

  if (!entityId || !label || latitude === null || longitude === null) {
    return null;
  }

  const degrees = Number.parseFloat(row.precision ?? "");

  return {
    entityId,
    label,
    latitude,
    longitude,
    precisionDegrees: Number.isFinite(degrees) && degrees > 0 ? degrees : WIDEST_DEGREES,
    countryId: entityIdFrom(row.country),
  };
}

async function queryPlaceLinks(refs: PlaceRef[]) {
  const rows = await queryWikidata(
    `SELECT ?film ?tmdbKey ?filming ?narrative WHERE {
  ${clauses(refs)}
  { ?film wdt:P915 ?filming } UNION { ?film wdt:P840 ?narrative }
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );
  const byEntity = new Map<string, string>();
  const byTmdb = new Map<string, string>();

  for (const ref of refs) {
    if (ref.wikidataId) {
      byEntity.set(ref.wikidataId, ref.key);
    }

    if (ref.tmdbId) {
      byTmdb.set(tmdbKey({ mediaType: ref.mediaType, tmdbId: ref.tmdbId }), ref.key);
    }
  }

  return rows.flatMap((row): { key: string; kind: PlaceKind; placeId: string }[] => {
    const entity = entityIdFrom(row.film);
    const key =
      (row.tmdbKey ? byTmdb.get(row.tmdbKey) : null) ?? (entity ? byEntity.get(entity) : null);
    const filming = entityIdFrom(row.filming);
    const narrative = entityIdFrom(row.narrative);
    const placeId = filming ?? narrative;

    return key && placeId ? [{ key, kind: filming ? "filming" : "narrative", placeId }] : [];
  });
}

async function queryPlaceDetails(entityIds: string[]) {
  const rows = await queryWikidata(
    `SELECT ?place ?placeLabel ?lat ?lon ?precision ?country WHERE {
  VALUES ?place { ${entityIds.map((id) => `wd:${id}`).join(" ")} }
  ?place rdfs:label ?placeLabel .
  FILTER(LANG(?placeLabel) = "en")
  ?place p:P625/psv:P625 ?node .
  ?node wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  OPTIONAL { ?node wikibase:geoPrecision ?precision . }
  OPTIONAL { ?place wdt:P17 ?country . }
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );

  return rows.flatMap((row): PlaceRecord[] => {
    const record = placeRecord({
      entity: row.place,
      label: row.placeLabel,
      latitude: row.lat,
      longitude: row.lon,
      precision: row.precision,
      country: row.country,
    });

    return record ? [record] : [];
  });
}

async function queryCountries(entityIds: string[]) {
  const rows = await queryWikidata(
    `SELECT ?country ?countryLabel ?lat ?lon ?precision WHERE {
  VALUES ?country { ${entityIds.map((id) => `wd:${id}`).join(" ")} }
  ?country rdfs:label ?countryLabel .
  FILTER(LANG(?countryLabel) = "en")
  ?country p:P625/psv:P625 ?node .
  ?node wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  OPTIONAL { ?node wikibase:geoPrecision ?precision . }
}`,
    { timeoutMs: TIMEOUT_MS, cacheTtl: CACHE_TTL },
  );

  return rows.flatMap((row): PlaceRecord[] => {
    const record = placeRecord({
      entity: row.country,
      label: row.countryLabel,
      latitude: row.lat,
      longitude: row.lon,
      precision: row.precision,
      country: row.country,
    });

    return record ? [record] : [];
  });
}

export async function readTitlePlaces(refs: PlaceRef[]): Promise<TitlePlaceResult> {
  const usable = refs.flatMap((ref) => {
    const wikidataId = ref.wikidataId && /^Q\d+$/u.test(ref.wikidataId) ? ref.wikidataId : null;
    const tmdbId =
      ref.tmdbId !== null && Number.isInteger(ref.tmdbId) && ref.tmdbId > 0 ? ref.tmdbId : null;

    return wikidataId || tmdbId ? [{ ...ref, wikidataId, tmdbId }] : [];
  });
  const links: { key: string; kind: PlaceKind; placeId: string }[] = [];

  for (let index = 0; index < usable.length; index += BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    links.push(...(await queryPlaceLinks(usable.slice(index, index + BATCH))));
  }

  const placeIds = [...new Set(links.map((link) => link.placeId))];
  const details = new Map<string, PlaceRecord>();

  for (let index = 0; index < placeIds.length; index += DETAIL_BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    const found = await queryPlaceDetails(placeIds.slice(index, index + DETAIL_BATCH));

    for (const record of found) {
      details.set(record.entityId, record);
    }
  }

  const rows = links.flatMap((link): TitlePlaceRow[] => {
    const place = details.get(link.placeId);

    return place ? [{ key: link.key, kind: link.kind, place }] : [];
  });

  const known = new Set(rows.map((row) => row.place.entityId));
  const wanted = [
    ...new Set(rows.flatMap((row) => (row.place.countryId ? [row.place.countryId] : []))),
  ].filter((entityId) => !known.has(entityId));
  const countries: PlaceRecord[] = [];

  for (let index = 0; index < wanted.length; index += COUNTRY_BATCH) {
    // oxlint-disable-next-line no-await-in-loop
    countries.push(...(await queryCountries(wanted.slice(index, index + COUNTRY_BATCH))));
  }

  return { rows, countries };
}
