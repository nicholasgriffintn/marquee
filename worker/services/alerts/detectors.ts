import { titlePath } from "../../../src/domain/catalog.ts";
import { logError } from "../../lib/logging.ts";
import { confirmedArrivals, settleAnnounced, waitingViewers } from "../../repositories/arrivals.ts";
import { readItems } from "../../repositories/catalog-reader.ts";
import type { AlertCandidate, Detector } from "./types.ts";

const SEASON_HORIZON_DAYS = 45;
const CINEMA_HORIZON_DAYS = 7;
const PERSON_WINDOW_DAYS = 45;

function pathFor(titleId: string, title: string) {
  const [mediaType, tmdbId] = titleId.split(":");

  return mediaType && tmdbId
    ? titlePath({ mediaType: mediaType === "tv" ? "tv" : "movie", tmdbId: Number(tmdbId), title })
    : "/";
}

const arrivals: Detector = {
  kind: "arrival",
  priority: 2,
  async find(env, options) {
    const found = await confirmedArrivals(env.DB);

    if (found.length === 0) {
      return [];
    }

    const titleIds = [...new Set(found.map((arrival) => arrival.titleId))];
    const [titles, byTitle] = await Promise.all([
      readItems(env.DB, titleIds),
      waitingViewers(env.DB, titleIds),
    ]);
    const byId = new Map(titles.map((title) => [title.id, title]));
    const names = new Map(
      titles.flatMap((title) => title.providers.map((provider) => [provider.id, provider.name])),
    );
    const candidates: AlertCandidate[] = [];

    for (const arrival of found) {
      const title = byId.get(arrival.titleId);

      if (!title) {
        continue;
      }

      for (const viewer of byTitle.get(arrival.titleId) ?? []) {
        candidates.push({
          kind: "arrival",
          viewerId: viewer.viewerId,
          key: `${arrival.titleId}:${arrival.providerId}`,
          titleId: arrival.titleId,
          headline: `${title.title} is showing now`,
          detail: `On ${names.get(arrival.providerId) ?? arrival.providerId}.`,
          path: titlePath(title),
        });
      }
    }

    if (options.send) {
      await settleAnnounced(env.DB, found);
    }

    return candidates;
  },
};

type SeasonRow = {
  viewerId: string;
  titleId: string;
  showName: string;
  season: number;
  airsAt: string;
  network: string | null;
};

const seasons: Detector = {
  kind: "season",
  priority: 1,
  async find(env, _options) {
    try {
      const rows = await env.DB.query<SeasonRow>(
        `SELECT v.viewer_id AS "viewerId", s.title_id AS "titleId", s.show_name AS "showName",
                s.season AS season, min(s.airs_at) AS "airsAt", s.network AS network
           FROM title_schedule AS s
           JOIN viewing_entries AS v ON v.title_id = s.title_id
          WHERE s.season IS NOT NULL
            AND s.season BETWEEN 2 AND 60
            AND s.episode = 1
            AND v.status IN ('watchlist', 'watching', 'watched')
            AND (EXTRACT(EPOCH FROM s.airs_at) / 86400.0) BETWEEN (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - INTERVAL '2 day')) / 86400.0)
                                         AND (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL))) / 86400.0)
            AND s.season > COALESCE(
                  (SELECT max(p.season) FROM title_schedule AS p
                    WHERE p.title_id = s.title_id
                      AND (EXTRACT(EPOCH FROM p.airs_at) / 86400.0) < (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - INTERVAL '30 day')) / 86400.0)), 0)
          GROUP BY v.viewer_id, s.title_id, s.season
          LIMIT 400`,
        [`+${SEASON_HORIZON_DAYS} days`],
      );

      return rows.rows.map((row): AlertCandidate => {
        const when = new Date(row.airsAt);
        const day = Number.isNaN(when.getTime())
          ? "soon"
          : when.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

        return {
          kind: "season",
          viewerId: row.viewerId,
          key: `${row.titleId}:s${row.season}`,
          titleId: row.titleId,
          headline: `${row.showName} is back`,
          detail: `Series ${row.season} starts ${day}${row.network ? ` on ${row.network}` : ""}.`,
          path: pathFor(row.titleId, row.showName),
        };
      });
    } catch (error) {
      logError("season_detector_failed", error);

      return [];
    }
  },
};

type CinemaRow = {
  viewerId: string;
  titleId: string;
  title: string;
  cinemaName: string;
  businessDay: string;
};

const cinema: Detector = {
  kind: "cinema",
  priority: 0,
  async find(env, _options) {
    try {
      const rows = await env.DB.query<CinemaRow>(
        `SELECT v.viewer_id AS "viewerId", c.title_id AS "titleId", t.title AS title,
                cin.name AS "cinemaName", min(c.business_day) AS "businessDay"
           FROM cinema_screenings AS c
           JOIN cinemas AS cin ON cin.id = c.cinema_id
           JOIN viewing_entries AS v ON v.title_id = c.title_id
           JOIN catalog_titles AS t ON t.id = c.title_id
          WHERE c.title_id IS NOT NULL
            AND v.status IN ('watchlist', 'watching')
            AND (EXTRACT(EPOCH FROM c.business_day) / 86400.0) BETWEEN (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 86400.0)
                                             AND (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP + CAST($1 AS INTERVAL))) / 86400.0)
          GROUP BY v.viewer_id, c.title_id
          ORDER BY businessDay
          LIMIT 200`,
        [`+${CINEMA_HORIZON_DAYS} days`],
      );

      return rows.rows.map((row): AlertCandidate => {
        const when = new Date(row.businessDay);
        const day = Number.isNaN(when.getTime())
          ? "this week"
          : when.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

        return {
          kind: "cinema",
          viewerId: row.viewerId,
          key: `${row.titleId}:${row.businessDay}`,
          titleId: row.titleId,
          headline: `${row.title} is on a real screen`,
          detail: `${row.cinemaName}, ${day}.`,
          path: pathFor(row.titleId, row.title),
        };
      });
    } catch (error) {
      logError("cinema_detector_failed", error);

      return [];
    }
  },
};

type PersonRow = { viewerId: string; titleId: string; title: string; person: string };

const people: Detector = {
  kind: "person",
  priority: 3,
  async find(env, _options) {
    try {
      const rows = await env.DB.query<PersonRow>(
        `SELECT DISTINCT b.viewer_id AS "viewerId", t.id AS "titleId", t.title AS title,
                cp.name AS person
           FROM viewer_beliefs AS b
           JOIN catalog_people AS cp
             ON lower(cp.name) = replace(replace(b.key, 'rule:person:', ''), 'person:', '')
           JOIN catalog_credits AS cr ON cr.person_id = cp.person_id
           JOIN catalog_titles AS t ON t.id = cr.title_id
          WHERE (b.key LIKE 'rule:person:%' OR b.key LIKE 'person:%')
            AND b.revoked_at IS NULL
            AND (b.suspended_until IS NULL OR (EXTRACT(EPOCH FROM b.suspended_until) / 86400.0) < (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) / 86400.0))
            AND COALESCE(t.release_date, DATE '1900-01-01')
                  > CURRENT_DATE + CAST($1 AS INTERVAL)
            AND NOT EXISTS (
                  SELECT 1 FROM viewing_entries AS v
                   WHERE v.viewer_id = b.viewer_id AND v.title_id = t.id
                )
          LIMIT 120`,
        [`-${PERSON_WINDOW_DAYS} days`],
      );

      return rows.rows.map((row): AlertCandidate => {
        const name = row.person.replaceAll(/\b\w/gu, (letter) => letter.toUpperCase());

        return {
          kind: "person",
          viewerId: row.viewerId,
          key: row.titleId,
          titleId: row.titleId,
          headline: `Something new with ${name}`,
          detail: `${row.title}, and you follow them.`,
          path: pathFor(row.titleId, row.title),
        };
      });
    } catch (error) {
      logError("person_detector_failed", error);

      return [];
    }
  },
};

export const DETECTORS: Detector[] = [seasons, arrivals, cinema, people];

export function detectorsFor(kinds: string[]) {
  return kinds.length ? DETECTORS.filter((detector) => kinds.includes(detector.kind)) : DETECTORS;
}
