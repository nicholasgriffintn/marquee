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
      </p>
    );
  }

  const upcoming = upcomingAirDate(item);

  if (upcoming) {
    return (
      <p className="detail-next">
        <span>Next episode</span>{" "}
        {formatDate(upcoming, { weekday: "long", day: "numeric", month: "long" })}, date only
      </p>
    );
  }

  if (item.mediaType !== "tv" || !item.lastAirDate) {
    return null;
  }

  return (
    <p className="detail-next">
      <span>Last shown</span>{" "}
      {formatDate(item.lastAirDate, { day: "numeric", month: "long", year: "numeric" })}
      {item.status ? ` · ${item.status}` : ""}
    </p>
  );
}
