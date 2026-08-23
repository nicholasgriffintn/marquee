import { titlePath, type MediaTitle } from "../../src/domain/catalog.ts";
import { buildAtom, type FeedEntry } from "../lib/atom.ts";
import { buildCalendar, type CalendarEvent } from "../lib/ical.ts";
import { logError } from "../lib/logging.ts";
import { databaseDate, parseJson } from "../lib/values.ts";
import { recentAlerts } from "../repositories/alerts.ts";
import { readItems } from "../repositories/catalog-reader.ts";
import type { Bindings } from "../types.ts";
import { isAlertKind, KIND_LABELS } from "./alerts/types.ts";
import type { Digest } from "./digest.ts";

const EPISODE_LIMIT = 300;
const RELEASE_LIMIT = 60;
const DEFAULT_EPISODE_MINUTES = 45;
const REFRESH_HOURS = 6;

type EpisodeRow = {
  titleId: string;
  showName: string;
  season: number | null;
  episode: number | null;
  episodeName: string | null;
  airsAt: string;
  network: string | null;
  watchedSeason: number | null;
  watchedEpisode: number | null;
};

type ReleaseRow = {
  titleId: string;
  releaseDate: string;
};

function behindProgress(row: EpisodeRow) {
  if (row.watchedSeason === null || row.season === null) {
    return false;
  }

  if (row.season < row.watchedSeason) {
    return true;
  }

  return (
    row.season === row.watchedSeason &&
    row.episode !== null &&
    row.watchedEpisode !== null &&
    row.episode <= row.watchedEpisode
  );
}

function episodeNumber(row: EpisodeRow) {
  if (row.season === null || row.episode === null) {
    return "";
  }

  return `S${row.season}E${String(row.episode).padStart(2, "0")}`;
}

function minutesFor(title: MediaTitle | undefined) {
  const runtime = title?.runtimeMinutes ?? DEFAULT_EPISODE_MINUTES;

  return Math.max(15, Math.min(180, runtime));
}

async function readEpisodes(env: Bindings, viewerId: string) {
  const rows = await env.DB.prepare(
    `SELECT s.title_id AS titleId, s.show_name AS showName, s.season, s.episode,
            s.episode_name AS episodeName, s.airs_at AS airsAt, s.network,
            v.season AS watchedSeason, v.episode AS watchedEpisode
       FROM title_schedule AS s
       JOIN viewing_entries AS v ON v.title_id = s.title_id AND v.viewer_id = ?1
      WHERE v.status IN ('watching', 'watchlist')
        AND s.airs_at >= datetime('now', '-12 hours')
      ORDER BY s.airs_at
      LIMIT ${EPISODE_LIMIT}`,
  )
    .bind(viewerId)
    .all<EpisodeRow>();

  return rows.results.filter((row) => !behindProgress(row));
}

async function readReleases(env: Bindings, viewerId: string) {
  const rows = await env.DB.prepare(
    `SELECT v.title_id AS titleId,
            substr(json_extract(t.payload, '$.releaseDate'), 1, 10) AS releaseDate
       FROM viewing_entries AS v
       JOIN catalog_titles AS t ON t.id = v.title_id
      WHERE v.viewer_id = ?1
        AND v.status = 'watchlist'
        AND json_extract(t.payload, '$.releaseDate') IS NOT NULL
        AND substr(json_extract(t.payload, '$.releaseDate'), 1, 10) >= date('now')
      ORDER BY releaseDate
      LIMIT ${RELEASE_LIMIT}`,
  )
    .bind(viewerId)
    .all<ReleaseRow>();

  return rows.results;
}

function episodeEvent(
  row: EpisodeRow,
  title: MediaTitle | undefined,
  origin: string,
  host: string,
): CalendarEvent | null {
  const airs = databaseDate(row.airsAt);

  if (Number.isNaN(airs.getTime())) {
    return null;
  }

  const number = episodeNumber(row);
  const named = [number, row.episodeName].filter(Boolean).join(" · ");
  const detail = [
    row.network ? `On ${row.network}.` : "",
    row.watchedSeason === null ? "" : `You are up to S${row.watchedSeason}E${row.watchedEpisode}.`,
    title?.overview ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    uid: `episode-${row.titleId.replace(":", "-")}-${number || row.airsAt.slice(0, 10)}@${host}`,
    start: airs,
    end: new Date(airs.getTime() + minutesFor(title) * 60_000),
    summary: named ? `${row.showName} — ${named}` : row.showName,
    description: detail,
    ...(title ? { url: `${origin}${titlePath(title)}` } : {}),
    categories: ["Marquee", "Episode"],
  };
}

function releaseEvent(row: ReleaseRow, title: MediaTitle, origin: string, host: string) {
  return {
    uid: `release-${row.titleId.replace(":", "-")}@${host}`,
    start: row.releaseDate,
    summary: `${title.title} is out`,
    description: [
      title.mediaType === "tv" ? "First shown" : "In cinemas or on release",
      title.overview,
    ]
      .filter(Boolean)
      .join(". "),
    url: `${origin}${titlePath(title)}`,
    categories: ["Marquee", "Release"],
  } satisfies CalendarEvent;
}

export async function buildDiaryCalendar(env: Bindings, viewerId: string, origin: string) {
  const host = new URL(origin).hostname;
  const [episodes, releases] = await Promise.all([
    readEpisodes(env, viewerId).catch((error: unknown): EpisodeRow[] => {
      logError("feed_episodes_failed", error, { viewerId });

      return [];
    }),
    readReleases(env, viewerId).catch((error: unknown): ReleaseRow[] => {
      logError("feed_releases_failed", error, { viewerId });

      return [];
    }),
  ]);
  const titles = await readItems(
    env.DB,
    [...episodes.map((row) => row.titleId), ...releases.map((row) => row.titleId)],
    EPISODE_LIMIT + RELEASE_LIMIT,
  );
  const byId = new Map(titles.map((title) => [title.id, title]));
  const events = [
    ...episodes.flatMap((row) => {
      const event = episodeEvent(row, byId.get(row.titleId), origin, host);

      return event ? [event] : [];
    }),
    ...releases.flatMap((row) => {
      const title = byId.get(row.titleId);

      return title ? [releaseEvent(row, title, origin, host)] : [];
    }),
  ];

  return buildCalendar({
    name: "Marquee",
    description: "Episodes and releases from your shelf.",
    refreshHours: REFRESH_HOURS,
    events,
  });
}

function alertEntries(
  alerts: Awaited<ReturnType<typeof recentAlerts>>,
  byId: Map<string, MediaTitle>,
  origin: string,
) {
  return alerts.map((alert): FeedEntry => {
    const title = alert.titleId ? byId.get(alert.titleId) : undefined;
    const label = isAlertKind(alert.kind) ? KIND_LABELS[alert.kind] : alert.kind;
    const updated = databaseDate(alert.sentAt);

    return {
      id: `${origin}/feeds/alert/${alert.kind}/${encodeURIComponent(alert.key)}`,
      title: title ? `${title.title} — ${label}` : label,
      link: title ? `${origin}${titlePath(title)}` : `${origin}/shelf`,
      updated: (Number.isNaN(updated.getTime()) ? new Date() : updated).toISOString(),
      summary: alert.detail || label,
      category: alert.kind,
    };
  });
}

async function digestEntry(env: Bindings, viewerId: string, origin: string) {
  const row = await env.DB.prepare(
    `SELECT payload, created_at AS createdAt FROM viewer_digests WHERE viewer_id = ?1`,
  )
    .bind(viewerId)
    .first<{ payload: string; createdAt: string }>();

  if (!row) {
    return [];
  }

  const digest = parseJson(row.payload) as Digest | null;

  if (!digest) {
    return [];
  }

  const created = databaseDate(row.createdAt);
  const numbers = digest.numbers;

  return [
    {
      id: `${origin}/feeds/digest/${encodeURIComponent(row.createdAt)}`,
      title: "Your week at the Marquee",
      link: `${origin}/this-week`,
      updated: (Number.isNaN(created.getTime()) ? new Date() : created).toISOString(),
      summary: [
        digest.lead?.line ?? "",
        `${numbers.added} added, ${numbers.finished} finished, ${numbers.shelved} on the shelf.`,
        `${digest.episodes.length} episode${digest.episodes.length === 1 ? "" : "s"} this week.`,
      ]
        .filter(Boolean)
        .join(" "),
      category: "digest",
    } satisfies FeedEntry,
  ];
}

export async function buildAlertFeed(
  env: Bindings,
  viewerId: string,
  origin: string,
  selfUrl: string,
) {
  const [alerts, digest] = await Promise.all([
    recentAlerts(env.DB, viewerId),
    digestEntry(env, viewerId, origin).catch((error: unknown): FeedEntry[] => {
      logError("feed_digest_failed", error, { viewerId });

      return [];
    }),
  ]);
  const titles = await readItems(
    env.DB,
    alerts.flatMap((alert) => (alert.titleId ? [alert.titleId] : [])),
    100,
  );
  const entries = [
    ...alertEntries(alerts, new Map(titles.map((t) => [t.id, t])), origin),
    ...digest,
  ]
    .sort((left: FeedEntry, right: FeedEntry) => right.updated.localeCompare(left.updated))
    .slice(0, 50);

  return buildAtom({
    id: `${origin}/feeds/alerts`,
    title: "Marquee — the Usher writes",
    subtitle: "Arrivals, returning series, cinema runs and your week.",
    selfUrl,
    siteUrl: `${origin}/shelf`,
    updated: entries[0]?.updated ?? new Date().toISOString(),
    entries,
  });
}
