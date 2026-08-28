import type { MediaTitle } from "../../domain/catalog";
import type { NextEpisode } from "../../hooks/useAvailability";
import { formatDate, formatDateTime } from "../../lib/dates";
import { DetailLine } from "./DetailNote";

function upcomingAirDate(item: MediaTitle) {
  return item.nextAirDate && item.nextAirDate >= new Date().toISOString().slice(0, 10)
    ? item.nextAirDate
    : null;
}

export function AirLine({
  item,
  nextEpisode,
}: {
  item: MediaTitle;
  nextEpisode: NextEpisode | null;
}) {
  if (nextEpisode) {
    return (
      <DetailLine label="Next episode" credit="Schedule from TVmaze">
        {nextEpisode.season && nextEpisode.episode
          ? `S${nextEpisode.season}E${nextEpisode.episode}`
          : ""}
        {nextEpisode.episodeName ? ` · ${nextEpisode.episodeName}` : ""} ·{" "}
        {formatDateTime(nextEpisode.airsAt, {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
        {nextEpisode.network ? ` · ${nextEpisode.network}` : ""}
      </DetailLine>
    );
  }

  const upcoming = upcomingAirDate(item);

  if (upcoming) {
    return (
      <DetailLine label="Next episode" credit="Schedule from TVmaze">
        {formatDate(upcoming, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        , date only
      </DetailLine>
    );
  }

  const slot = item.anime?.broadcast ?? null;
  const slotLabel = item.anime?.airing ? "Airs" : "Aired";

  if (item.mediaType !== "tv" || !item.lastAirDate) {
    return slot ? (
      <DetailLine label={slotLabel} credit="Slot from MyAnimeList">
        {slot}
      </DetailLine>
    ) : null;
  }

  return (
    <DetailLine label="Last shown" credit={slot ? "Slot from MyAnimeList" : undefined}>
      {formatDate(item.lastAirDate, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}
      {item.status ? ` · ${item.status}` : ""}
      {slot ? ` · ${slot}` : ""}
    </DetailLine>
  );
}
