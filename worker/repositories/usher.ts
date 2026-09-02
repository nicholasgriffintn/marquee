import { clamp } from "../lib/numbers.ts";
import { isRecord, parseJson } from "../lib/values.ts";
import { rebuildPersonTitles } from "./people.ts";
import { estimateTableRows } from "./table-stats.ts";

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

export async function readUsherRecord(db: Database, viewerId: string): Promise<UsherRecord> {
  const row = await db.first<UsherRow>(
    `SELECT status, asked, muted, ignored,
              snoozed_until AS "snoozedUntil",
              last_prompted_at AS "lastPromptedAt",
              last_seen_at AS "lastSeenAt"
       FROM viewer_usher WHERE viewer_id = $1`,
    [viewerId],
  );

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
  db: Database,
  viewerId: string,
  patch: Partial<UsherRecord>,
) {
  const current = await readUsherRecord(db, viewerId);
  const next = { ...current, ...patch };

  await db.execute(
    `INSERT INTO viewer_usher
         (viewer_id, status, asked, muted, ignored, snoozed_until, last_prompted_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(viewer_id) DO UPDATE SET
         status = excluded.status,
         asked = excluded.asked,
         muted = excluded.muted,
         ignored = excluded.ignored,
         snoozed_until = excluded.snoozed_until,
         last_prompted_at = excluded.last_prompted_at,
         last_seen_at = excluded.last_seen_at,
         updated_at = CURRENT_TIMESTAMP`,
    [
      viewerId,
      next.status,
      JSON.stringify(next.asked.slice(-200)),
      JSON.stringify(next.muted),
      next.ignored,
      next.snoozedUntil,
      next.lastPromptedAt,
      next.lastSeenAt,
    ],
  );

  return next;
}

export async function readAnswers(db: Database, viewerId: string) {
  const rows = await db.query<{ questionId: string; answer: string }>(
    `SELECT question_id AS "questionId", answer FROM viewer_answers WHERE viewer_id = $1`,
    [viewerId],
  );

  return new Map(rows.rows.map((row) => [row.questionId, parseJson(row.answer)]));
}

export async function saveAnswer(
  db: Database,
  viewerId: string,
  questionId: string,
  answer: unknown,
) {
  await db.execute(
    `INSERT INTO viewer_answers (viewer_id, question_id, answer)
       VALUES ($1, $2, $3)
       ON CONFLICT(viewer_id, question_id) DO UPDATE SET
         answer = excluded.answer,
         answered_at = CURRENT_TIMESTAMP`,
    [viewerId, questionId, JSON.stringify(answer)],
  );
}

export async function recordRailFeedback(
  db: Database,
  viewerId: string,
  railId: string,
  verdict: "good" | "bad",
) {
  await db.execute(
    `INSERT INTO rail_feedback (viewer_id, rail_id, verdict)
       VALUES ($1, $2, $3)
       ON CONFLICT(viewer_id, rail_id) DO UPDATE SET
         verdict = excluded.verdict,
         created_at = CURRENT_TIMESTAMP`,
    [viewerId, railId, verdict],
  );
}

export async function readRailFeedback(db: Database, viewerId: string) {
  const rows = await db.query<{ railId: string; verdict: "good" | "bad" }>(
    `SELECT rail_id AS "railId", verdict FROM rail_feedback WHERE viewer_id = $1`,
    [viewerId],
  );

  return new Map(rows.rows.map((row) => [row.railId, row.verdict]));
}

export async function searchPeople(db: Database, query: string, limit: number) {
  const term = query.trim().toLowerCase();

  if (term.length < 2) {
    return [];
  }

  const rows = await db.query<{ name: string }>(
    `SELECT name FROM catalog_people
       WHERE lower(name) LIKE $1
       ORDER BY CASE WHEN lower(name) LIKE $2 THEN 0 ELSE 1 END, titles DESC
       LIMIT $3`,
    [`%${term}%`, `${term}%`, clamp(limit, 1, 20)],
  );

  return rows.rows.map((row) => row.name);
}

export async function popularPeople(db: Database, limit: number) {
  const rows = await db.query<{ name: string }>(
    `SELECT name FROM catalog_people ORDER BY titles DESC LIMIT $1`,
    [clamp(limit, 1, 24)],
  );

  return rows.rows.map((row) => row.name);
}

export async function rebuildPeopleIndex(db: Database) {
  await rebuildPersonTitles(db);

  return estimateTableRows(db, "catalog_people");
}
