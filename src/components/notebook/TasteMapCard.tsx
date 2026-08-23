import { memo } from "react";
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
import { artwork, artworkSrcSet } from "../../lib/media";
import { TitleImage } from "../TitleImage";

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
    <span className="taste-card-stars" aria-label={`${rating} out of 5`}>
      {STARS.map((star) => (
        <span key={star} className={star <= rating ? "on" : ""} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

export const TasteMapCard = memo(function TasteMapCard({
  point,
  axes,
  artReady,
  onPick,
}: {
  point: MapPoint;
  axes: TasteMapResponse["axes"];
  artReady: boolean;
  onPick: (neighbour: MapNeighbour) => void;
}) {
  const sits = leaning(point, axes);
  const meta = pointMeta(point);

  return (
    <div className="taste-card">
      <div className="taste-card-head">
        <div className="taste-card-art">
          {artReady && (
            <TitleImage
              src={artwork(point.posterUrl, POSTER_WIDTH)}
              srcSet={artworkSrcSet(point.posterUrl, POSTER_WIDTH)}
              seed={point.titleId}
              label={point.title}
              eager
            />
          )}
        </div>

        <div className="taste-card-name">
          <strong>{point.title}</strong>
          {meta && <span>{meta}</span>}
          <em className={point.weight >= 0 ? "liked" : "cooled"}>{verdictLabel(point.weight)}</em>
        </div>
      </div>

      {point.genres.length > 0 && (
        <ul className="taste-card-genres">
          {point.genres.map((genre) => (
            <li key={genre}>{genre}</li>
          ))}
        </ul>
      )}

      {point.mark && (
        <div className="taste-card-mark">
          <span className="taste-card-label">Your mark</span>
          <p>
            {markStatusLabel(point.mark.status)}
            {point.mark.rating === null ? "" : " · "}
            {point.mark.rating !== null && <Stars rating={point.mark.rating} />}
            {markedLabel(point.mark.markedAt) && ` · ${markedLabel(point.mark.markedAt)}`}
          </p>
          {point.mark.note && <blockquote>{point.mark.note}</blockquote>}
        </div>
      )}

      {point.overview && <p className="taste-card-overview">{point.overview}</p>}

      {(sits || point.scores.length > 0) && (
        <dl className="taste-card-facts">
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
        <div className="taste-card-near">
          <span className="taste-card-label">Closest on your shelf</span>
          <ul>
            {point.neighbours.map((neighbour) => (
              <li key={neighbour.titleId}>
                <button type="button" onClick={() => onPick(neighbour)}>
                  {neighbour.title}
                  {neighbour.year ? <small>{neighbour.year}</small> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {point.tmdbId > 0 && (
        <Link className="taste-map-open" to={titlePath(point)}>
          Open its page
        </Link>
      )}
    </div>
  );
});
