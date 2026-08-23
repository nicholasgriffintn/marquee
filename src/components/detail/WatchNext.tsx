import type { MediaTitle } from "../../domain/catalog";
import type { InsightPair } from "../../hooks/useTitleInsight";
import { TitleArt } from "../TitleArt";
import { ArrowIcon } from "../ui";

export function WatchNext({
  pairs,
  onOpen,
}: {
  pairs: InsightPair[];
  onOpen: (item: MediaTitle) => void;
}) {
  if (pairs.length === 0) {
    return null;
  }

  return (
    <div className="detail-pairs">
      <span>
        <i>AI</i> Watch next
      </span>
      {pairs.map((pair) => (
        <button
          type="button"
          key={pair.item.id}
          className="detail-pair"
          onClick={() => onOpen(pair.item)}
        >
          <TitleArt
            url={pair.item.posterUrl}
            seed={pair.item.id}
            label={pair.item.title}
            width={160}
          />
          <span>
            <strong>{pair.item.title}</strong>
            <small>{pair.reason}</small>
          </span>
          <ArrowIcon />
        </button>
      ))}
    </div>
  );
}
