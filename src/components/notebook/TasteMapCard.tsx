import { memo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { titlePath } from "../../domain/catalog";
import {
  leaning,
  markStatusLabel,
  pointMeta,
  verdictLabel,
  type MapNeighbour,
  type MapPoint,
  type TasteMapResponse,
} from "../../domain/notebook";
import { StarIcon } from "../../ui";
import { TitleArt } from "../TitleArt";

import styles from "./TasteMapCard.module.css";

const POSTER_WIDTH = 92;
const STARS = [1, 2, 3, 4, 5];

const marked = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function markedLabel(stamp: string) {
  const parsed = Date.parse(stamp);

  return Number.isNaN(parsed) ? "" : marked.format(parsed);
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className={styles.stars} aria-label={`${rating} out of 5`}>
      {STARS.map((star) => (
        <StarIcon key={star} className={star <= rating ? styles.starOn : undefined} />
      ))}
    </span>
  );
}

export const TasteMapCard = memo(function TasteMapCard({
  point,
  axes,
  artReady,
  onPick,
  focusSignal,
}: {
  point: MapPoint;
  axes: TasteMapResponse["axes"];
  artReady: boolean;
  onPick: (neighbour: MapNeighbour) => void;
  focusSignal?: number;
}) {
  const sits = leaning(point, axes);
  const meta = pointMeta(point);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusSignal) {
      cardRef.current?.focus();
    }
  }, [focusSignal]);

  return (
    <div className={styles.card} ref={cardRef} tabIndex={-1}>
      <div className={styles.head}>
        <div className={styles.art}>
          {artReady && (
            <TitleArt
              url={point.posterUrl}
              seed={point.titleId}
              label={point.title}
              width={POSTER_WIDTH}
              eager
            />
          )}
        </div>

        <div className={styles.name}>
          <strong>{point.title}</strong>
          {meta && <span>{meta}</span>}
          <em className={point.weight >= 0 ? styles.liked : styles.cooled}>
            {verdictLabel(point.weight)}
          </em>
        </div>
      </div>

      {point.genres.length > 0 && (
        <ul className={styles.genres}>
          {point.genres.map((genre) => (
            <li key={genre}>{genre}</li>
          ))}
        </ul>
      )}

      {point.mark && (
        <div className={styles.mark}>
          <span className={styles.label}>Your mark</span>
          <p>
            {markStatusLabel(point.mark.status)}
            {point.mark.rating === null ? "" : " · "}
            {point.mark.rating !== null && <Stars rating={point.mark.rating} />}
            {markedLabel(point.mark.markedAt) && ` · ${markedLabel(point.mark.markedAt)}`}
          </p>
          {point.mark.note && <blockquote>{point.mark.note}</blockquote>}
        </div>
      )}

      {point.overview && <p className={styles.overview}>{point.overview}</p>}

      {(sits || point.scores.length > 0) && (
        <dl className={styles.facts}>
          {sits && (
            <div>
              <dt>Where it sits</dt>
              <dd>{sits}</dd>
            </div>
          )}
          {point.scores.length > 0 && (
            <div>
              <dt>What everyone else says</dt>
              <dd>{point.scores.map((score) => `${score.label} ${score.display}`).join(" · ")}</dd>
            </div>
          )}
        </dl>
      )}

      {point.neighbours.length > 0 && (
        <div className={styles.near}>
          <span className={styles.label}>Closest on your shelf</span>
          <ul className={styles.nearList}>
            {point.neighbours.map((neighbour) => (
              <li key={neighbour.titleId}>
                <button type="button" className={styles.nearItem} onClick={() => onPick(neighbour)}>
                  {neighbour.title}
                  {neighbour.year ? <small>{neighbour.year}</small> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {point.tmdbId > 0 && (
        <Link className={styles.open} to={titlePath(point)}>
          Open its page
        </Link>
      )}
    </div>
  );
});
