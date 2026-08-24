import { watchOrderCaption } from "../../domain/anime";
import type { MediaTitle } from "../../domain/catalog";
import type { WatchOrderEntry } from "../../hooks/useWatchOrder";
import { TitleArt } from "../TitleArt";
import { ArrowIcon } from "../ui";

export function WatchOrder({
  label,
  entries,
  onOpen,
}: {
  label: string;
  entries: WatchOrderEntry[];
  onOpen: (item: MediaTitle) => void;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="detail-order">
      <span>{label}</span>
      {entries.map((entry) => (
        <button
          type="button"
          key={entry.item.id}
          className="detail-pair"
          onClick={() => onOpen(entry.item)}
        >
          <TitleArt
            url={entry.item.posterUrl}
            seed={entry.item.id}
            label={entry.item.title}
            width={160}
          />
          <span>
            <strong>{entry.item.title}</strong>
            <small>{watchOrderCaption(entry.relation, entry.item)}</small>
          </span>
          <ArrowIcon />
        </button>
      ))}
    </div>
  );
}
