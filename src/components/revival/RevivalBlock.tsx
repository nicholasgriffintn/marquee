import { Link } from "react-router-dom";

import type { MediaTitle } from "../../domain/catalog";
import { revivalPath, runtimeLabel, SOURCE_LABELS } from "../../domain/revival";
import { useTitleReels } from "../../hooks/useRevival";

export function RevivalBlock({ item }: { item: MediaTitle }) {
  const works = useTitleReels(item.id, item.mediaType, item.tmdbId);

  if (works.length === 0) {
    return null;
  }

  return (
    <div className="watch-actions revival-actions">
      <span>Playing here, free</span>
      {works.map((work) => (
        <Link className="watch-button" key={work.id} to={revivalPath(work)}>
          <span className="revival-mark">▶</span>
          <span>
            {work.title}
            <small>
              {[
                work.mirrored ? "Our print" : SOURCE_LABELS[work.source],
                runtimeLabel(work.runtimeSeconds),
                "Public domain",
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
        </Link>
      ))}
    </div>
  );
}
