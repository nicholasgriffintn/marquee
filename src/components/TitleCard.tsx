import { memo } from "react";

import type { MediaTitle } from "../domain/catalog";
import { changeLabel, compactCount, mediaMeta } from "../lib/media";
import { RatingLine } from "./RatingLine";
import { TitleArt } from "./TitleArt";
import { ProviderBadge } from "./ui";

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
  return (
    <article className={`rail-card${item.pending ? " rail-card-pending" : ""}`}>
      <button
        type="button"
        className="rail-card-hit"
        onClick={() => onOpen(item)}
        aria-label={`Open ${item.title}`}
      >
        <div className={`rail-art${item.backdropUrl ? "" : " rail-art-missing"}`}>
          <TitleArt
            url={item.backdropUrl ?? item.posterUrl}
            seed={item.id}
            label={item.title}
            width={780}
            kind="backdrop"
            wide
            portraitUrl={item.posterUrl ?? item.backdropUrl}
          />
          <div className="rail-tags">
            {rank !== undefined && <span className="rail-rank">#{rank}</span>}
            <span className="rail-number">
              {item.pending ? "FETCHING" : item.mediaType === "movie" ? "FILM" : "TV"}
            </span>
          </div>
          <div className="rail-provider-row">
            {item.providers.slice(0, RAIL_PROVIDER_LIMIT).map((provider) => (
              <ProviderBadge provider={provider} compact key={provider.id} />
            ))}
            {item.providers.length > RAIL_PROVIDER_LIMIT && (
              <span className="rail-provider-more">
                +{item.providers.length - RAIL_PROVIDER_LIMIT}
              </span>
            )}
          </div>
        </div>
        <strong className="rail-card-title">{item.title}</strong>
      </button>
      <div className="rail-meta">
        {item.buzz && (
          <span className="rail-buzz">
            Wikipedia {changeLabel(item.buzz.delta)}
            <em>{compactCount(item.buzz.views)} readers this week</em>
          </span>
        )}
        <RatingLine item={item} limit={RAIL_RATING_LIMIT} />
        <span>{mediaMeta(item)}</span>
      </div>
    </article>
  );
});
