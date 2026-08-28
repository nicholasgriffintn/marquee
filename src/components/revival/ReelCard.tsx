import { Link } from "react-router-dom";

import { revivalPath, workMeta, type RevivalCard } from "../../domain/revival";
import { classNames } from "../../lib/class-names";
import { TitleArt } from "../TitleArt";

import cardStyles from "../TitleCard.module.css";
import styles from "./ReelCard.module.css";

export function ReelCard({ work }: { work: RevivalCard }) {
  return (
    <article className={classNames(cardStyles.card, styles.card)}>
      <Link className={cardStyles.hit} to={revivalPath(work)} aria-label={`Open ${work.title}`}>
        <div className={cardStyles.art}>
          <TitleArt
            url={work.stillUrl}
            seed={work.id}
            label={work.title}
            width={780}
            kind="backdrop"
            wide
          />
          <div className={cardStyles.tags}>
            <span className={cardStyles.kind}>{work.mirrored ? "OUR PRINT" : "ON LOAN"}</span>
          </div>
          <strong className={cardStyles.title}>{work.title}</strong>
        </div>
      </Link>
      <div className={cardStyles.meta}>
        <span className={styles.free}>Free to watch here</span>
        <span className={cardStyles.metaLine}>
          {workMeta(work) || "Public domain"}
          {work.condition === "rough" ? " · rough print" : ""}
        </span>
      </div>
    </article>
  );
}
