import type { MediaTitle } from "../../domain/catalog";
import type { NextEpisode } from "../../hooks/useAvailability";
import { formatDate, formatDateTime } from "../../lib/dates";

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
      <p className="detail-next">
        <span>Next episode</span>
        {nextEpisode.season && nextEpisode.episode
          ? ` S${nextEpisode.season}E${nextEpisode.episode}`
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
        <small className="detail-credit">Schedule from TVmaze</small>
      </p>
    );
  }

  const upcoming = upcomingAirDate(item);

  if (upcoming) {
    return (
      <p className="detail-next">
        <span>Next episode</span>{" "}
        {formatDate(upcoming, { weekday: "long", day: "numeric", month: "long" })}, date only
        <small className="detail-credit">Schedule from TVmaze</small>
      </p>
    );
  }

  const slot = item.anime?.broadcast ?? null;
  const slotLabel = item.anime?.airing ? "Airs" : "Aired";

  if (item.mediaType !== "tv" || !item.lastAirDate) {
    return slot ? (
      <p className="detail-next">
        <span>{slotLabel}</span> {slot}
        <small className="detail-credit">Slot from MyAnimeList</small>
      </p>
    ) : null;
  }

  return (
    <p className="detail-next">
      <span>Last shown</span>{" "}
      {formatDate(item.lastAirDate, { day: "numeric", month: "long", year: "numeric" })}
      {item.status ? ` · ${item.status}` : ""}
      {slot ? ` · ${slot}` : ""}
      {slot ? <small className="detail-credit">Slot from MyAnimeList</small> : null}
    </p>
  );
}
