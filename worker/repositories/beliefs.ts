import { isBeliefPolarity, type Belief, type BeliefPolarity } from "../../src/domain/notebook.ts";
import { logError } from "../lib/logging.ts";

export type BeliefEvidenceKind = "signal" | "answer" | "entry" | "note";

export type BeliefDraft = {
  key: string;
  value: string;
  strength: number;
  confidence: number;
  sourceRule: string;
  trait?: string;
  polarity?: BeliefPolarity;
  expiresInDays?: number;
  evidence: { kind: BeliefEvidenceKind; id: string }[];
};

type BeliefRow = {
  id: string;
  key: string;
  value: string;
  strength: number;
  confidence: number;
  scope: string;
  source_rule: string;
  trait: string | null;
  polarity: string | null;
  edited: number;
  suspended_until: string | null;
  evidence: number;
};

function mapBelief(row: BeliefRow): Belief {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    strength: row.strength,
    confidence: row.confidence,
    scope: row.scope === "tonight" || row.scope === "week" ? row.scope : "always",
    sourceRule: row.source_rule,
    trait: row.trait,
    polarity: isBeliefPolarity(row.polarity) ? row.polarity : null,
    edited: row.edited === 1,
    suspendedUntil: row.suspended_until,
    evidence: row.evidence,
  };
}

export async function readBeliefs(db: D1Database, viewerId: string): Promise<Belief[]> {
  if (!viewerId) {
    return [];
  }

  try {
    const rows = await db
      .prepare(
        `SELECT b.id, b.key, b.value, b.strength, b.confidence, b.scope, b.source_rule,
                b.trait, b.polarity, b.edited, b.suspended_until,
                (SELECT count(*) FROM belief_evidence AS e WHERE e.belief_id = b.id) AS evidence
           FROM viewer_beliefs AS b
          WHERE b.viewer_id = ?1
            AND b.revoked_at IS NULL
            AND (b.expires_at IS NULL OR julianday(b.expires_at) > julianday('now'))
          ORDER BY b.confidence * b.strength DESC`,
      )
      .bind(viewerId)
      .all<BeliefRow>();

    return rows.results.map(mapBelief);
  } catch (error) {
    logError("beliefs_read_failed", error);

    return [];
  }
}

export async function readEvidenceIds(
  db: D1Database,
  viewerId: string,
  keys: string[],
  kind: BeliefEvidenceKind,
): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();

  if (!viewerId || keys.length === 0) {
    return found;
  }

  const placeholders = keys.map((_, index) => `?${index + 3}`).join(",");

  try {
    const rows = await db
      .prepare(
        `SELECT b.key AS key, e.evidence_id AS evidenceId
           FROM viewer_beliefs AS b
           JOIN belief_evidence AS e ON e.belief_id = b.id
          WHERE b.viewer_id = ?1 AND e.evidence_kind = ?2 AND b.key IN (${placeholders})`,
      )
      .bind(viewerId, kind, ...keys)
      .all<{ key: string; evidenceId: string }>();

    for (const row of rows.results) {
      found.set(row.key, [...(found.get(row.key) ?? []), row.evidenceId]);
    }

    return found;
  } catch (error) {
    logError("belief_evidence_read_failed", error);

    return found;
  }
}

export async function readBeliefEvidenceIds(
  db: D1Database,
  viewerId: string,
  beliefId: string,
  kind: BeliefEvidenceKind,
) {
  if (!viewerId || !beliefId) {
    return [];
  }

  const rows = await db
    .prepare(
      `SELECT e.evidence_id AS evidenceId
         FROM belief_evidence AS e
         JOIN viewer_beliefs AS b ON b.id = e.belief_id
        WHERE b.id = ?1 AND b.viewer_id = ?2 AND e.evidence_kind = ?3
        ORDER BY e.noted_at DESC`,
    )
    .bind(beliefId, viewerId, kind)
    .all<{ evidenceId: string }>();

  return rows.results.map((row) => row.evidenceId);
}

export async function writeDerivedBeliefs(db: D1Database, viewerId: string, drafts: BeliefDraft[]) {
  if (!viewerId) {
    return;
  }

  try {
    const existing = await db
      .prepare(`SELECT id, key, edited FROM viewer_beliefs WHERE viewer_id = ?1`)
      .bind(viewerId)
      .all<{ id: string; key: string; edited: number }>();
    const byKey = new Map(existing.results.map((row) => [row.key, row]));
    const derivedKeys = new Set(drafts.map((draft) => draft.key));
    const statements: D1PreparedStatement[] = [];

    for (const draft of drafts) {
      const current = byKey.get(draft.key);
      const id = current?.id ?? crypto.randomUUID();

      if (current?.edited === 1) {
        statements.push(
          db
            .prepare(
              `UPDATE viewer_beliefs SET strength = ?2, confidence = ?3, trait = ?4, polarity = ?5,
                      updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?1`,
            )
            .bind(
              id,
              draft.strength,
              draft.confidence,
              draft.trait ?? null,
              draft.polarity ?? null,
            ),
        );
      } else {
        statements.push(
          db
            .prepare(
              `INSERT INTO viewer_beliefs
                 (id, viewer_id, key, value, strength, confidence, source_rule, expires_at,
                  trait, polarity, revoked_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, CURRENT_TIMESTAMP)
               ON CONFLICT (viewer_id, key) DO UPDATE SET
                 value = excluded.value,
                 strength = excluded.strength,
                 confidence = excluded.confidence,
                 source_rule = excluded.source_rule,
                 expires_at = excluded.expires_at,
                 trait = excluded.trait,
                 polarity = excluded.polarity,
                 revoked_at = NULL,
                 updated_at = CURRENT_TIMESTAMP`,
            )
            .bind(
              id,
              viewerId,
              draft.key,
              draft.value,
              draft.strength,
              draft.confidence,
              draft.sourceRule,
              draft.expiresInDays
                ? new Date(Date.now() + draft.expiresInDays * 86_400_000).toISOString()
                : null,
              draft.trait ?? null,
              draft.polarity ?? null,
            ),
        );
      }

      for (const item of draft.evidence.slice(0, 12)) {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO belief_evidence (belief_id, evidence_kind, evidence_id)
               VALUES ((SELECT id FROM viewer_beliefs WHERE viewer_id = ?1 AND key = ?2), ?3, ?4)`,
            )
            .bind(viewerId, draft.key, item.kind, item.id),
        );
      }
    }

    for (const row of existing.results) {
      if (!derivedKeys.has(row.key) && row.edited === 0 && !row.key.startsWith("hunch:")) {
        statements.push(
          db
            .prepare(`UPDATE viewer_beliefs SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?1`)
            .bind(row.id),
        );
      }
    }

    if (statements.length) {
      await db.batch(statements);
    }
  } catch (error) {
    logError("beliefs_write_failed", error);
  }
}

export async function editBelief(
  db: D1Database,
  viewerId: string,
  beliefId: string,
  patch: { value?: string; suspendedUntil?: string | null; revoke?: boolean },
) {
  const sets: string[] = ["edited = 1", "updated_at = CURRENT_TIMESTAMP"];
  const bindings: unknown[] = [];

  if (patch.value !== undefined) {
    bindings.push(patch.value);
    sets.push(`value = ?${bindings.length + 2}`);
  }

  if (patch.suspendedUntil !== undefined) {
    bindings.push(patch.suspendedUntil);
    sets.push(`suspended_until = ?${bindings.length + 2}`);
  }

  if (patch.revoke) {
    sets.push("revoked_at = CURRENT_TIMESTAMP");
  }

  const result = await db
    .prepare(`UPDATE viewer_beliefs SET ${sets.join(", ")} WHERE id = ?1 AND viewer_id = ?2`)
    .bind(beliefId, viewerId, ...bindings)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

const FOLLOW_RULE = "manual:follow";

export function personKey(name: string) {
  return `rule:person:${name.trim().toLowerCase()}`;
}

export async function readFollowedPeople(db: D1Database, viewerId: string) {
  if (!viewerId) {
    return [];
  }

  try {
    const rows = await db
      .prepare(
        `SELECT key FROM viewer_beliefs
          WHERE viewer_id = ?1 AND key LIKE 'rule:person:%' AND revoked_at IS NULL`,
      )
      .bind(viewerId)
      .all<{ key: string }>();

    return rows.results.map((row) => row.key.replace("rule:person:", ""));
  } catch (error) {
    logError("followed_people_failed", error);

    return [];
  }
}

export async function setPersonFollow(
  db: D1Database,
  viewerId: string,
  name: string,
  follow: boolean,
) {
  const key = personKey(name);

  if (!follow) {
    await db
      .prepare(
        `UPDATE viewer_beliefs SET revoked_at = CURRENT_TIMESTAMP, edited = 1,
                updated_at = CURRENT_TIMESTAMP
          WHERE viewer_id = ?1 AND key = ?2`,
      )
      .bind(viewerId, key)
      .run();

    return;
  }

  await db
    .prepare(
      `INSERT INTO viewer_beliefs
         (id, viewer_id, key, value, strength, confidence, source_rule, edited, updated_at)
       VALUES (?1, ?2, ?3, ?4, 1, 1, ?5, 1, CURRENT_TIMESTAMP)
       ON CONFLICT (viewer_id, key) DO UPDATE SET
         value = excluded.value,
         edited = 1,
         revoked_at = NULL,
         suspended_until = NULL,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(crypto.randomUUID(), viewerId, key, `You follow ${name.trim()}.`, FOLLOW_RULE)
    .run();
}
