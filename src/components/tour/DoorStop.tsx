import { useCallback, useState } from "react";

import { queryJsonFresh, QueryError } from "../../lib/query-client";
import { Button } from "../../ui";
import { useStageReport } from "../screening/ScreeningContext";

import styles from "./DoorStop.module.css";

type Knock = { id: number; ok: boolean; line: string };

const KNOCK_LIMIT = 3;

export function DoorStop() {
  const [knocks, setKnocks] = useState<Knock[]>([]);
  const [isKnocking, setIsKnocking] = useState(false);
  const report = useStageReport("door");

  const knock = useCallback(async () => {
    setIsKnocking(true);

    try {
      const answer = await queryJsonFresh<{ line: string }>("/api/catalog/door");

      setKnocks((current) => [...current, { id: current.length, ok: true, line: answer.line }]);
      report("knock", answer.line);
    } catch (error) {
      const line = error instanceof QueryError ? error.message : "The door did not answer at all.";

      setKnocks((current) => [...current, { id: current.length, ok: false, line }]);
      report("refused", line);
    } finally {
      setIsKnocking(false);
    }
  }, [report]);

  const refused = knocks.some((entry) => !entry.ok);

  return (
    <div className={styles.door}>
      <div className={styles.frame}>
        <p className={styles.plate}>Staff only</p>
        <p className={styles.budget}>
          {KNOCK_LIMIT} a minute through this door. He counts. He has always counted.
        </p>

        <Button
          variant="primary"
          size="lg"
          onClick={() => void knock()}
          disabled={isKnocking}
          className={styles.knock}
        >
          {isKnocking ? "Knocking…" : "Knock"}
        </Button>
      </div>

      <ol className={styles.log} aria-live="polite">
        {knocks.map((entry, index) => (
          <li key={entry.id} className={entry.ok ? styles.let : styles.turned}>
            <span className={styles.count}>{String(index + 1).padStart(2, "0")}</span>
            <span className={styles.status}>{entry.ok ? "200" : "429"}</span>
            <span className={styles.line}>{entry.line}</span>
          </li>
        ))}

        {knocks.length === 0 && (
          <li className={styles.waiting}>
            <span className={styles.count}>—</span>
            <span className={styles.status}>···</span>
            <span className={styles.line}>Nothing yet. He is on the other side of it.</span>
          </li>
        )}
      </ol>

      {refused && (
        <p className={styles.verdict}>
          That is the real guard, on the real endpoint, in his own words. No status code was harmed
          in the writing of it.
        </p>
      )}
    </div>
  );
}
