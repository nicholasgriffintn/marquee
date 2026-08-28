import { useId } from "react";

import { useResource } from "../../hooks/useResource";
import { parseDatabaseDate } from "../../lib/dates";
import { Callout, Heading, Modal, StatusNote } from "../../ui";

import styles from "./SampleModal.module.css";

type SampleCell = string | number | null;

type SampleResponse = {
  columns: string[];
  rows: Record<string, SampleCell>[];
};

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]/;

function formatCell(value: SampleCell) {
  if (value === null) {
    return "—";
  }

  if (typeof value === "string" && TIMESTAMP_PATTERN.test(value)) {
    return parseDatabaseDate(value)?.toLocaleString() ?? value;
  }

  return typeof value === "number" ? value.toLocaleString() : value;
}

export function SampleModal({
  type,
  itemKey,
  label,
  onClose,
}: {
  type: "count" | "budget";
  itemKey: string;
  label: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const { data, error, isLoading } = useResource<SampleResponse>(
    `/api/admin/overview/sample/${type}/${itemKey}`,
    { errorMessage: "Could not read a sample." },
  );

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <Heading level={2} size="subhead" id={titleId} className={styles.title}>
        {label}
      </Heading>
      {error && <Callout>{error}</Callout>}
      {isLoading && (
        <StatusNote busy surface="paper">
          Reading a sample…
        </StatusNote>
      )}
      {data && data.rows.length === 0 && <StatusNote surface="paper">Nothing here yet.</StatusNote>}
      {data && data.rows.length > 0 && (
        <div className={styles.wrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {data.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                // Sample rows have no stable identity beyond position - this is a read-only snapshot.
                // oxlint-disable-next-line react/no-array-index-key
                <tr key={index}>
                  {data.columns.map((column) => (
                    <td key={column}>{formatCell(row[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
