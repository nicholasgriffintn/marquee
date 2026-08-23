import { useState } from "react";
import { Link } from "react-router-dom";

import { revivalPath, workMeta, type RevivalWork } from "../../domain/revival";
import { artwork, artworkSrcSet } from "../../lib/media";
import { ArtPlaceholder } from "../ArtPlaceholder";

export function ReelCard({ work }: { work: RevivalWork }) {
  const [failed, setFailed] = useState(false);
  const source = failed ? null : work.stillUrl;
  const src = artwork(source, 780, "backdrop");

  return (
    <article className="rail-card revival-card">
      <Link className="rail-card-hit" to={revivalPath(work)} aria-label={`Open ${work.title}`}>
        <div className={`rail-art${src ? "" : " rail-art-missing"}`}>
          {src ? (
            <img
              src={src}
              srcSet={artworkSrcSet(source, 780, "backdrop")}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
            />
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
