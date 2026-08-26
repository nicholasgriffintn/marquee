import { Link } from "react-router-dom";

import { revivalPath, runtimeLabel, SOURCE_LABELS, type RevivalWork } from "../../domain/revival";
import { PlayIcon } from "../ui";

export function RevivalBlock({ works }: { works: RevivalWork[] }) {
  if (works.length === 0) {
    return null;
  }

  return (
    <div className="watch-actions revival-actions">
      <span>Playing here, free</span>
      {works.map((work) => (
        <Link className="watch-button" key={work.id} to={revivalPath(work)}>
          <span className="revival-mark">
            <PlayIcon />
          </span>
          <span>
            {work.title}
            <small>
              {[
                work.mirrored ? "Our print" : SOURCE_LABELS[work.source],
                runtimeLabel(work.runtimeSeconds),
                "Public domain in the UK",
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
