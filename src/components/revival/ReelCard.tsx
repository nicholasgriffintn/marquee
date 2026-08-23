import { Link } from "react-router-dom";

import { revivalPath, workMeta, type RevivalWork } from "../../domain/revival";
import { ArtPlaceholder } from "../ArtPlaceholder";

export function ReelCard({ work }: { work: RevivalWork }) {
  return (
    <article className="rail-card revival-card">
      <Link className="rail-card-hit" to={revivalPath(work)} aria-label={`Open ${work.title}`}>
        <div className={`rail-art${work.stillUrl ? "" : " rail-art-missing"}`}>
          {work.stillUrl ? (
            <img src={work.stillUrl} alt="" loading="lazy" decoding="async" />
          ) : (
            <ArtPlaceholder seed={work.id} label={work.title} wide />
          )}
          <div className="rail-tags">
            <span className="rail-number">{work.mirrored ? "OUR PRINT" : "ON LOAN"}</span>
          </div>
          <strong>{work.title}</strong>
        </div>
      </Link>
      <div className="rail-meta">
        <span className="revival-free">Free to watch here</span>
        <span>{workMeta(work) || "Public domain"}</span>
      </div>
    </article>
  );
}
