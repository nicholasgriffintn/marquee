import { useMemo, useState } from "react";

import type { MediaTitle } from "../../domain/catalog";
import { TOUR_OPENERS } from "../../domain/tour";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useResource } from "../../hooks/useResource";
import { classNames } from "../../lib/class-names";
import { Chip, Skeleton, Text } from "../../ui";
import { SearchField } from "../SearchField";
import { TourTitles } from "./TourTitles";

import styles from "./FoyerStop.module.css";

const DEBOUNCE_MS = 350;
const LANE_LIMIT = 5;
const SKELETON_ROWS = [0, 1, 2, 3, 4];
const NO_ITEMS: MediaTitle[] = [];

type SearchResponse = { items: MediaTitle[] };

function laneUrl(query: string, hybrid: boolean) {
  const parameters = new URLSearchParams({ query });

  if (hybrid) {
    parameters.set("mode", "hybrid");
  }

  return `/api/catalog/search?${parameters}`;
}

function Lane({
  heading,
  note,
  items,
  isLoading,
  marked,
  onOpen,
  tone,
  empty,
}: {
  heading: string;
  note: string;
  items: MediaTitle[];
  isLoading: boolean;
  marked?: Set<string>;
  onOpen: (item: MediaTitle) => void;
  tone?: "meaning";
  empty: string;
}) {
  return (
    <div className={classNames(styles.lane, tone === "meaning" && styles.meaning)}>
      <p className={styles.laneHead}>
        <span>{heading}</span>
        <em>{note}</em>
      </p>

      {items.length > 0 ? (
        <TourTitles items={items} onOpen={onOpen} marked={marked} limit={LANE_LIMIT} />
      ) : isLoading ? (
        <div className={styles.laneSkeleton} aria-hidden="true">
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className={styles.rowSkeleton} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{empty}</p>
      )}
    </div>
  );
}

export function FoyerStop({
  isActive,
  onOpen,
}: {
  isActive: boolean;
  onOpen: (item: MediaTitle) => void;
}) {
  const [query, setQuery] = useState(TOUR_OPENERS[0]);
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const enabled = isActive && debounced.length > 1;

  const keyword = useResource<SearchResponse>(laneUrl(debounced, false), { enabled });
  const meaning = useResource<SearchResponse>(laneUrl(debounced, true), { enabled });
  const keywordItems = keyword.data?.items ?? NO_ITEMS;
  const meaningItems = meaning.data?.items ?? NO_ITEMS;

  const onlyMeaning = useMemo(() => {
    const known = new Set(keywordItems.slice(0, LANE_LIMIT).map((item) => item.id));

    return new Set(
      meaningItems
        .slice(0, LANE_LIMIT)
        .filter((item) => !known.has(item.id))
        .map((item) => item.id),
    );
  }, [keywordItems, meaningItems]);

  const tally =
    meaningItems.length === 0 && keywordItems.length === 0
      ? "Nothing in the building under that, either way. The index is only as good as what has been read."
      : onlyMeaning.size > 0
        ? `${onlyMeaning.size} of those ${onlyMeaning.size === 1 ? "was" : "were"} found by meaning alone. The words never had them.`
        : "Both lanes agree on this one. That happens when you nearly know the title.";

  return (
    <div className={styles.foyer}>
      <div className={styles.ask}>
        <SearchField
          value={query}
          onChange={setQuery}
          label="Describe a film without naming it"
          placeholder="describe it, do not name it"
          className={styles.field}
        />

        <div className={styles.openers}>
          {TOUR_OPENERS.map((opener) => (
            <Chip key={opener} selected={opener === query} onClick={() => setQuery(opener)}>
              {opener}
            </Chip>
          ))}
        </div>
      </div>

      <div className={styles.lanes}>
        <Lane
          heading="What the words found"
          note="keyword pass, no model involved"
          items={keywordItems}
          isLoading={keyword.isLoading}
          onOpen={onOpen}
          empty="Not one of those words is in the catalogue. Nothing for it to match on."
        />
        <Lane
          heading="What the meaning found"
          note="embeddings, interleaved and reranked"
          items={meaningItems}
          isLoading={meaning.isLoading}
          marked={onlyMeaning}
          onOpen={onOpen}
          tone="meaning"
          empty="Nothing close enough to bother you with."
        />
      </div>

      <Text size="sm" tone="muted" className={styles.tally}>
        {tally}
      </Text>
    </div>
  );
}
