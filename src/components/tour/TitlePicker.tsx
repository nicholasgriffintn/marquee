import { useState } from "react";

import type { MediaTitle } from "../../domain/catalog";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useResource } from "../../hooks/useResource";
import { TitleArt } from "../TitleArt";

import styles from "./TitlePicker.module.css";

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 5;

export function TitlePicker({
  label,
  chosen,
  onChoose,
}: {
  label: string;
  chosen: MediaTitle | null;
  onChoose: (item: MediaTitle | null) => void;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const { data } = useResource<{ items: MediaTitle[] }>(
    `/api/catalog/search?query=${encodeURIComponent(debounced)}`,
    { enabled: debounced.length > 1 && !chosen },
  );
  const items = data?.items ?? [];

  return (
    <div className={styles.picker}>
      <p className={styles.label}>{label}</p>

      {chosen ? (
        <div className={styles.chosen}>
          <span className={styles.art}>
            <TitleArt url={chosen.posterUrl} seed={chosen.id} label={chosen.title} width={160} />
          </span>
          <span className={styles.chosenCopy}>
            <strong>{chosen.title}</strong>
            <small>{chosen.year ?? "—"}</small>
          </span>
          <button
            type="button"
            className={styles.swap}
            onClick={() => {
              setQuery("");
              onChoose(null);
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            className={styles.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name one"
            aria-label={label}
          />

          {items.length > 0 && (
            <ul className={styles.results}>
              {items.slice(0, RESULT_LIMIT).map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => onChoose(item)}>
                    {item.title}
                    <small>{item.year ?? "—"}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
