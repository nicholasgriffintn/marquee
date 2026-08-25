import { clamp } from "../lib/numbers.ts";
import { isRecord, parseJson } from "../lib/values.ts";
import { PERSON_CREDITS, rebuildPersonTitles } from "./people.ts";

export type UsherRecord = {
  status: "new" | "in-progress" | "done" | "dismissed";
  asked: string[];
  muted: Record<string, string>;
  ignored: number;
  snoozedUntil: string | null;
  lastPromptedAt: string | null;
  lastSeenAt: string | null;
};

type UsherRow = {
  status: string;
  asked: string;
  muted: string;
  ignored: number;
  snoozedUntil: string | null;
  lastPromptedAt: string | null;
  lastSeenAt: string | null;
};

const EMPTY: UsherRecord = {
  status: "new",
  asked: [],
  muted: {},
  ignored: 0,
  snoozedUntil: null,
  lastPromptedAt: null,
  lastSeenAt: null,
};

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 200)
    : [];
}

function mutes(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, until]) => typeof until === "string")
      .slice(0, 60),
  ) as Record<string, string>;
}

export async function readUsherRecord(db: D1Database, viewerId: string): Promise<UsherRecord> {
  const row = await db
    .prepare(
      `SELECT status, asked, muted, ignored,
              snoozed_until AS snoozedUntil,
              last_prompted_at AS lastPromptedAt,
              last_seen_at AS lastSeenAt
       FROM viewer_usher WHERE viewer_id = ?`,
    )
    .bind(viewerId)
    .first<UsherRow>();

  if (!row) {
    return EMPTY;
  }

  return {
    status:
      row.status === "in-progress" || row.status === "done" || row.status === "dismissed"
        ? row.status
        : "new",
    asked: strings(parseJson(row.asked)),
    muted: mutes(parseJson(row.muted)),
    ignored: Number.isFinite(row.ignored) ? row.ignored : 0,
    snoozedUntil: row.snoozedUntil,
    lastPromptedAt: row.lastPromptedAt,
    lastSeenAt: row.lastSeenAt,
  };
}

export async function writeUsherRecord(
  db: D1Database,
  viewerId: string,
  patch: Partial<UsherRecord>,
) {
  const current = await readUsherRecord(db, viewerId);
  const next = { ...current, ...patch };

  await db
    .prepare(
      `INSERT INTO viewer_usher
         (viewer_id, status, asked, muted, ignored, snoozed_until, last_prompted_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(viewer_id) DO UPDATE SET
         status = excluded.status,
         asked = excluded.asked,
         muted = excluded.muted,
         ignored = excluded.ignored,
         snoozed_until = excluded.snoozed_until,
         last_prompted_at = excluded.last_prompted_at,
         last_seen_at = excluded.last_seen_at,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      viewerId,
      next.status,
      JSON.stringify(next.asked.slice(-200)),
      JSON.stringify(next.muted),
      next.ignored,
      next.snoozedUntil,
      next.lastPromptedAt,
      next.lastSeenAt,
    )
    .run();

  return next;
}

export async function readAnswers(db: D1Database, viewerId: string) {
  const rows = await db
    .prepare(`SELECT question_id AS questionId, answer FROM viewer_answers WHERE viewer_id = ?`)
    .bind(viewerId)
    .all<{ questionId: string; answer: string }>();

  return new Map(rows.results.map((row) => [row.questionId, parseJson(row.answer)]));
}

export async function saveAnswer(
  db: D1Database,
  viewerId: string,
  questionId: string,
  answer: unknown,
) {
  await db
    .prepare(
      `INSERT INTO viewer_answers (viewer_id, question_id, answer)
       VALUES (?, ?, ?)
       ON CONFLICT(viewer_id, question_id) DO UPDATE SET
         answer = excluded.answer,
         answered_at = CURRENT_TIMESTAMP`,
    )
    .bind(viewerId, questionId, JSON.stringify(answer))
    .run();
}

export async function recordRailFeedback(
  db: D1Database,
  viewerId: string,
  railId: string,
  verdict: "good" | "bad",
) {
  await db
    .prepare(
      `INSERT INTO rail_feedback (viewer_id, rail_id, verdict)
       VALUES (?, ?, ?)
       ON CONFLICT(viewer_id, rail_id) DO UPDATE SET
         verdict = excluded.verdict,
         created_at = CURRENT_TIMESTAMP`,
    )
    .bind(viewerId, railId, verdict)
    .run();
}

export async function readRailFeedback(db: D1Database, viewerId: string) {
  const rows = await db
    .prepare(`SELECT rail_id AS railId, verdict FROM rail_feedback WHERE viewer_id = ?`)
    .bind(viewerId)
    .all<{ railId: string; verdict: "good" | "bad" }>();

  return new Map(rows.results.map((row) => [row.railId, row.verdict]));
}

export async function searchPeople(db: D1Database, query: string, limit: number) {
  const term = query.trim().toLowerCase();

  if (term.length < 2) {
    return [];
  }

  const rows = await db
    .prepare(
      `SELECT name FROM catalog_people
       WHERE lower(name) LIKE ?
       ORDER BY CASE WHEN lower(name) LIKE ? THEN 0 ELSE 1 END, titles DESC
       LIMIT ?`,
    )
    .bind(`%${term}%`, `${term}%`, clamp(limit, 1, 20))
    .all<{ name: string }>();

  return rows.results.map((row) => row.name);
}

export async function popularPeople(db: D1Database, limit: number) {
  const rows = await db
    .prepare(`SELECT name FROM catalog_people ORDER BY titles DESC LIMIT ?`)
    .bind(clamp(limit, 1, 24))
    .all<{ name: string }>();

  return rows.results.map((row) => row.name);
}

export async function rebuildPeopleIndex(db: D1Database) {
  await db.prepare(`DELETE FROM catalog_people`).run();
  await db
    .prepare(
      `INSERT INTO catalog_people (person_id, name, titles)
       SELECT personId, max(personName), count(*) AS titles
       FROM (${PERSON_CREDITS})
       GROUP BY personId
       HAVING titles >= 2
       ORDER BY titles DESC
       LIMIT 40000`,
    )
    .run();

  const total = await db
    .prepare(`SELECT count(*) AS people FROM catalog_people`)
    .first<{ people: number }>();

  await rebuildPersonTitles(db);

  return total?.people ?? 0;
}
