import { memo } from "react";
import { Link } from "react-router-dom";

import { titlePath, type MediaTitle } from "../domain/catalog";
import { classNames } from "../lib/class-names";
import { changeLabel, compactCount, mediaMeta } from "../lib/media";
import { isModifiedClick } from "../lib/navigation";
import { ProviderBadge } from "./ProviderBadge";
import { RatingLine } from "./RatingLine";
import { TitleArt } from "./TitleArt";

import styles from "./TitleCard.module.css";

const RAIL_PROVIDER_LIMIT = 3;
const RAIL_RATING_LIMIT = 3;

export const TitleCard = memo(function TitleCard({
  item,
  onOpen,
  rank,
}: {
  item: MediaTitle;
  onOpen: (title: MediaTitle) => void;
  rank?: number;
}) {
  const path = titlePath(item);

  return (
    <article className={classNames(styles.card, item.pending && styles.pending)}>
      <Link
        to={path}
        viewTransition
        className={styles.hit}
        aria-label={`Open ${item.title}`}
        onClick={(event) => {
          if (isModifiedClick(event)) {
            return;
          }

          event.preventDefault();
          onOpen(item);
        }}
      >
        <div className={styles.art}>
          <TitleArt
            url={item.backdropUrl ?? item.posterUrl}
            seed={item.id}
            label={item.title}
            width={780}
            kind="backdrop"
            wide
            portraitUrl={item.posterUrl ?? item.backdropUrl}
          />
          <div className={styles.tags}>
            {rank !== undefined && <span className={styles.rank}>#{rank}</span>}
            <span className={styles.kind}>
              {item.pending ? "FETCHING" : item.mediaType === "movie" ? "FILM" : "TV"}
            </span>
          </div>
          {item.providers.length > 0 && (
            <div className={styles.providers}>
              {item.providers.slice(0, RAIL_PROVIDER_LIMIT).map((provider) => (
                <ProviderBadge
                  provider={provider}
                  compact
                  key={provider.id}
                  className={styles.providerBadge}
                />
              ))}
              {item.providers.length > RAIL_PROVIDER_LIMIT && (
                <span className={styles.providerMore}>
                  +{item.providers.length - RAIL_PROVIDER_LIMIT}
                </span>
              )}
            </div>
          )}
        </div>
        <strong className={styles.title}>{item.title}</strong>
      </Link>
      <div className={styles.meta}>
        {item.buzz && (
          <span className={styles.buzz}>
            Wikipedia {changeLabel(item.buzz.delta)}
            <em>{compactCount(item.buzz.views)} readers this week</em>
          </span>
        )}
        <RatingLine item={item} limit={RAIL_RATING_LIMIT} />
        <span className={styles.metaLine}>{mediaMeta(item)}</span>
      </div>
    </article>
  );
});
