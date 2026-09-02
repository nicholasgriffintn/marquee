import type { EntryStatus } from "../../src/domain/entries.ts";
import { importStatus, type ImportedActivity } from "../../src/domain/imports.ts";
import type { DatabaseTransaction, DatabaseValue } from "../database/types.ts";

export type ViewingEventType =
  | "status"
  | "watch"
  | "rating"
  | "episode_watch"
  | "episode_rating"
  | "remove";

type ViewingEvent = {
  id: string;
  source: string;
  sourceEventId: string;
  eventType: ViewingEventType;
  status: EntryStatus | null;
  watched: number | null;
  rating: number | null;
  watchedAt: string | null;
  season: number | null;
  episode: number | null;
  occurredAt: string | null;
  recordedAt: string;
};

type EventDraft = {
  source: string;
  sourceSubject: string;
  sourceEventId: string;
  eventType: ViewingEventType;
  status?: EntryStatus | null;
  watched?: boolean | null;
  rating?: number | null;
  watchedAt?: string | null;
  season?: number | null;
  episode?: number | null;
  occurredAt?: string | null;
  importRunId?: string | null;
};

const EVENT_COLUMNS = `id,
  source,
  source_event_id AS "sourceEventId",
  event_type AS "eventType",
  status,
  watched,
  rating,
  watched_at AS "watchedAt",
  season_number AS season,
  episode_number AS episode,
  occurred_at AS "occurredAt",
  recorded_at AS "recordedAt"`;

function isManual(source: string) {
  return source === "marquee";
}

function eventTime(event: ViewingEvent) {
  return Date.parse(event.occurredAt ?? event.recordedAt);
}

function latest(events: ViewingEvent[]) {
  return events.toSorted((left, right) => eventTime(right) - eventTime(left))[0] ?? null;
}

const STATUS_STRENGTH: Record<EntryStatus, number> = {
  watchlist: 0,
  watching: 1,
  watched: 2,
  dropped: 3,
};

function importedStatus(events: ViewingEvent[], titleId: string) {
  const candidates = events.flatMap((event): { status: EntryStatus; event: ViewingEvent }[] => {
    if (event.eventType === "status" && event.status) {
      return [{ status: event.status, event }];
    }

    if (event.eventType === "watch" && titleId.startsWith("movie:")) {
      return [{ status: "watched", event }];
    }

    if (event.eventType === "episode_watch" && event.watched === 1) {
      return [{ status: "watching", event }];
    }

    return [];
  });

  return (
    candidates.toSorted(
      (left, right) =>
        STATUS_STRENGTH[right.status] - STATUS_STRENGTH[left.status] ||
        eventTime(right.event) - eventTime(left.event),
    )[0] ?? null
  );
}

function projectedStatus(events: ViewingEvent[], titleId: string) {
  const manualStatus = latest(
    events.filter((event) => isManual(event.source) && event.eventType === "status"),
  );
  const manualRemove = latest(
    events.filter((event) => isManual(event.source) && event.eventType === "remove"),
  );

  if (manualRemove && (!manualStatus || eventTime(manualRemove) >= eventTime(manualStatus))) {
    return null;
  }

  if (manualStatus?.status) {
    return { status: manualStatus.status, source: manualStatus.source };
  }

  const imported = importedStatus(
    events.filter((event) => !isManual(event.source)),
    titleId,
  );

  return imported ? { status: imported.status, source: imported.event.source } : null;
}

function projectedRating(events: ViewingEvent[]) {
  const manual = latest(
    events.filter(
      (event) => isManual(event.source) && event.eventType === "rating" && event.season === null,
    ),
  );
  const imported = latest(
    events.filter(
      (event) => !isManual(event.source) && event.eventType === "rating" && event.season === null,
    ),
  );
  const selected = manual ?? imported;

  return { rating: selected?.rating ?? null, source: selected?.source ?? null };
}

function lastWatchedAt(events: ViewingEvent[]) {
  return (
    events
      .filter(
        (event) =>
          (event.eventType === "watch" || event.eventType === "episode_watch") && event.watchedAt,
      )
      .map((event) => event.watchedAt as string)
      .toSorted((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
  );
}

function episodeKeys(events: ViewingEvent[]) {
  return [
    ...new Set(
      events.flatMap((event) =>
        event.season !== null && event.episode !== null ? [`${event.season}:${event.episode}`] : [],
      ),
    ),
  ];
}

const EPISODE_FIELDS = 8;

function episodeRow(events: ViewingEvent[], viewerId: string, titleId: string, key: string) {
  const [seasonText, episodeText] = key.split(":");
  const season = Number(seasonText);
  const episode = Number(episodeText);
  const scoped = events.filter((event) => event.season === season && event.episode === episode);
  const pick = (manual: boolean, type: ViewingEventType) =>
    latest(scoped.filter((event) => isManual(event.source) === manual && event.eventType === type));
  const watch = pick(true, "episode_watch") ?? pick(false, "episode_watch");
  const rating = pick(true, "episode_rating") ?? pick(false, "episode_rating");
  const watched = watch?.watched === 1;

  return [
    crypto.randomUUID(),
    viewerId,
    titleId,
    season,
    episode,
    watched ? 1 : 0,
    watched ? (watch?.watchedAt ?? watch?.occurredAt ?? null) : null,
    rating?.rating ?? null,
  ] satisfies DatabaseValue[];
}

async function projectEpisodes(
  transaction: DatabaseTransaction,
  viewerId: string,
  titleId: string,
  events: ViewingEvent[],
) {
  const rows = episodeKeys(events).map((key) => episodeRow(events, viewerId, titleId, key));

  if (rows.length > 0) {
    const tuples = rows.map((_, index) => {
      const at = (field: number) => `$${index * EPISODE_FIELDS + field}`;

      return `(${at(1)}, ${at(2)}, ${at(3)}, 'episode', ${at(4)}, ${at(5)}, ${at(6)}, ${at(7)}, ${at(8)}, '')`;
    });

    await transaction.execute(
      `INSERT INTO viewing_episode_entries
         (id, viewer_id, title_id, scope, season_number, episode_number,
          watched, watched_at, rating, notes)
       VALUES ${tuples.join(", ")}
       ON CONFLICT(viewer_id, title_id, scope, season_number, episode_number) DO UPDATE SET
         watched = excluded.watched,
         watched_at = excluded.watched_at,
         rating = excluded.rating,
         updated_at = CURRENT_TIMESTAMP`,
      rows.flat(),
    );
  }

  await transaction.execute(
    `DELETE FROM viewing_episode_entries
      WHERE viewer_id = $1 AND title_id = $2 AND scope = 'episode'
        AND watched = 0 AND rating IS NULL AND trim(notes) = ''
        AND NOT EXISTS (
          SELECT 1 FROM viewing_events AS events
           WHERE events.viewer_id = $1 AND events.title_id = $2
             AND events.season_number = viewing_episode_entries.season_number
             AND events.episode_number = viewing_episode_entries.episode_number
        )`,
    [viewerId, titleId],
  );
}

const EVENT_FIELDS = 15;

function eventValues(viewerId: string, titleId: string, event: EventDraft): DatabaseValue[] {
  return [
    crypto.randomUUID(),
    viewerId,
    titleId,
    event.source,
    event.sourceSubject,
    event.sourceEventId,
    event.eventType,
    event.status ?? null,
    event.watched === null || event.watched === undefined ? null : event.watched ? 1 : 0,
    event.rating ?? null,
    event.watchedAt ?? null,
    event.season ?? null,
    event.episode ?? null,
    event.importRunId ?? null,
    event.occurredAt ?? null,
  ];
}

export async function insertViewingEvents(
  transaction: DatabaseTransaction,
  viewerId: string,
  entries: { titleId: string; event: EventDraft }[],
) {
  if (entries.length === 0) {
    return 0;
  }

  const tuples = entries.map(
    (_, index) =>
      `(${Array.from({ length: EVENT_FIELDS }, (__, field) => `$${index * EVENT_FIELDS + field + 1}`).join(", ")})`,
  );
  const result = await transaction.execute(
    `INSERT INTO viewing_events
       (id, viewer_id, title_id, source, source_subject, source_event_id, event_type,
        status, watched, rating, watched_at, season_number, episode_number, import_run_id, occurred_at)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (viewer_id, source, source_subject, source_event_id, event_type) DO NOTHING`,
    entries.flatMap((entry) => eventValues(viewerId, entry.titleId, entry.event)),
  );

  return result.rowCount;
}

export function insertViewingEvent(
  transaction: DatabaseTransaction,
  viewerId: string,
  titleId: string,
  event: EventDraft,
) {
  return insertViewingEvents(transaction, viewerId, [{ titleId, event }]);
}

export function importedActivityEvents(runId: string, activity: ImportedActivity): EventDraft[] {
  const common = {
    source: activity.source,
    sourceSubject: activity.sourceSubject,
    sourceEventId: activity.sourceEventId,
    occurredAt: activity.watchedAt ?? null,
    importRunId: runId,
  };
  const imported = importStatus(activity.eventTypes);
  const status =
    imported === "watched" && activity.mediaType === "tv" && activity.season !== undefined
      ? "watching"
      : imported;
  const episodic = activity.season !== undefined && activity.episode !== undefined;

  return [
    ...(status ? [{ ...common, eventType: "status" as const, status }] : []),
    ...(activity.eventTypes.includes("watched")
      ? [
          {
            ...common,
            eventType: episodic ? ("episode_watch" as const) : ("watch" as const),
            watched: true,
            watchedAt: activity.watchedAt ?? null,
            season: activity.season ?? null,
            episode: activity.episode ?? null,
          },
        ]
      : []),
    ...(activity.eventTypes.includes("rated") && activity.rating !== undefined
      ? [
          {
            ...common,
            eventType: episodic ? ("episode_rating" as const) : ("rating" as const),
            rating: activity.rating,
            season: activity.season ?? null,
            episode: activity.episode ?? null,
          },
        ]
      : []),
  ];
}

export function insertManualTitleEvents(
  transaction: DatabaseTransaction,
  viewerId: string,
  input: { titleId: string; status: EntryStatus; rating: number | null },
) {
  const actionId = crypto.randomUUID();

  const events = [
    insertViewingEvent(transaction, viewerId, input.titleId, {
      source: "marquee",
      sourceSubject: "",
      sourceEventId: `${actionId}:status`,
      eventType: "status",
      status: input.status,
    }),
    insertViewingEvent(transaction, viewerId, input.titleId, {
      source: "marquee",
      sourceSubject: "",
      sourceEventId: `${actionId}:rating`,
      eventType: "rating",
      rating: input.rating,
    }),
  ];

  if (input.status === "watched") {
    const watchedAt = new Date().toISOString();

    events.push(
      insertViewingEvent(transaction, viewerId, input.titleId, {
        source: "marquee",
        sourceSubject: "",
        sourceEventId: `${actionId}:watch`,
        eventType: "watch",
        watchedAt,
        occurredAt: watchedAt,
      }),
    );
  }

  return Promise.all(events);
}

export function insertManualRemovalEvent(
  transaction: DatabaseTransaction,
  viewerId: string,
  titleId: string,
) {
  return insertViewingEvent(transaction, viewerId, titleId, {
    source: "marquee",
    sourceSubject: "",
    sourceEventId: crypto.randomUUID(),
    eventType: "remove",
  });
}

export function insertManualEpisodeEvents(
  transaction: DatabaseTransaction,
  viewerId: string,
  input: {
    titleId: string;
    season: number;
    episode: number;
    watched: boolean;
    rating: number | null;
  },
) {
  const actionId = crypto.randomUUID();

  return Promise.all([
    insertViewingEvent(transaction, viewerId, input.titleId, {
      source: "marquee",
      sourceSubject: "",
      sourceEventId: `${actionId}:watch`,
      eventType: "episode_watch",
      watched: input.watched,
      watchedAt: input.watched ? new Date().toISOString() : null,
      season: input.season,
      episode: input.episode,
    }),
    insertViewingEvent(transaction, viewerId, input.titleId, {
      source: "marquee",
      sourceSubject: "",
      sourceEventId: `${actionId}:rating`,
      eventType: "episode_rating",
      rating: input.rating,
      season: input.season,
      episode: input.episode,
    }),
  ]);
}

export function insertManualEpisodeWatchEvent(
  transaction: DatabaseTransaction,
  viewerId: string,
  input: { titleId: string; season: number; episode: number; watched: boolean },
) {
  const watchedAt = input.watched ? new Date().toISOString() : null;

  return insertViewingEvent(transaction, viewerId, input.titleId, {
    source: "marquee",
    sourceSubject: "",
    sourceEventId: crypto.randomUUID(),
    eventType: "episode_watch",
    watched: input.watched,
    watchedAt,
    occurredAt: watchedAt,
    season: input.season,
    episode: input.episode,
  });
}

export async function projectViewingTitle(db: Database, viewerId: string, titleId: string) {
  await db.transaction(async (transaction) => {
    const rows = await transaction.query<ViewingEvent>(
      `SELECT ${EVENT_COLUMNS}
         FROM viewing_events
        WHERE viewer_id = $1 AND title_id = $2
        ORDER BY occurred_at NULLS LAST, recorded_at, id`,
      [viewerId, titleId],
    );
    const events = rows.rows;
    const status = projectedStatus(events, titleId);
    const rating = projectedRating(events);

    if (!status) {
      await transaction.execute(
        `DELETE FROM viewing_entries WHERE viewer_id = $1 AND title_id = $2`,
        [viewerId, titleId],
      );
    } else {
      await transaction.execute(
        `INSERT INTO viewing_entries
           (id, viewer_id, title_id, status, rating, thoughts, last_watched_at,
            status_source, rating_source, projected_at)
         VALUES ($1, $2, $3, $4, $5, '', $6, $7, $8, CURRENT_TIMESTAMP)
         ON CONFLICT(viewer_id, title_id) DO UPDATE SET
           status = excluded.status,
           rating = excluded.rating,
           last_watched_at = excluded.last_watched_at,
           status_source = excluded.status_source,
           rating_source = excluded.rating_source,
           projected_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP`,
        [
          crypto.randomUUID(),
          viewerId,
          titleId,
          status.status,
          rating.rating,
          lastWatchedAt(events),
          status.source,
          rating.source,
        ],
      );
    }

    await projectEpisodes(transaction, viewerId, titleId, events);
  });
}
