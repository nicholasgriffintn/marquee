import type { MediaTitle } from "../../domain/catalog";
import { mediaMeta } from "../../lib/media";
import { TitleArt } from "../TitleArt";

export function TitleTrack({
  label,
  items,
  currentId,
  caption,
  onOpen,
}: {
  label: string;
  items: MediaTitle[];
  currentId?: string;
  caption: (item: MediaTitle) => string;
  onOpen: (item: MediaTitle) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="detail-similar">
      <span>{label}</span>
      <div className="detail-similar-track">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`detail-similar-card${item.id === currentId ? " current" : ""}`}
            onClick={() => onOpen(item)}
          >
            <TitleArt url={item.posterUrl} seed={item.id} label={item.title} width={160} />
            <strong>{item.title}</strong>
            <small>{caption(item)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function collectionCaption(item: MediaTitle) {
  return item.year ? String(item.year) : "—";
}

export function similarCaption(item: MediaTitle) {
  return mediaMeta(item);
}
