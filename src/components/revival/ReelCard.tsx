import { Link } from "react-router-dom";

import { revivalPath, workMeta, type RevivalCard } from "../../domain/revival";
import { TitleArt } from "../TitleArt";

export function ReelCard({ work }: { work: RevivalCard }) {
  return (
    <article className="rail-card revival-card">
      <Link className="rail-card-hit" to={revivalPath(work)} aria-label={`Open ${work.title}`}>
        <div className={`rail-art${work.stillUrl ? "" : " rail-art-missing"}`}>
          <TitleArt
            url={work.stillUrl}
            seed={work.id}
            label={work.title}
            width={780}
            kind="backdrop"
            wide
          />
          <div className="rail-tags">
            <span className="rail-number">{work.mirrored ? "OUR PRINT" : "ON LOAN"}</span>
          </div>
          <strong>{work.title}</strong>
        </div>
      </Link>
      <div className="rail-meta">
        <span className="revival-free">Free to watch here</span>
        <span>
          {workMeta(work) || "Public domain"}
          {work.condition === "rough" ? " · rough print" : ""}
        </span>
      </div>
    </article>
  );
}
