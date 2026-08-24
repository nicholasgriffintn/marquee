import { useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { artwork } from "../lib/media";

type Video = { key: string; name: string; type: string };

function videosFor(item: MediaTitle): Video[] {
  const videos = item.videos?.length
    ? item.videos
    : item.trailerKey
      ? [{ key: item.trailerKey, name: "Trailer", type: "Trailer" }]
      : [];
  const malKey = item.anime?.trailerKey;

  if (!malKey || videos.some((video) => video.key === malKey)) {
    return videos;
  }

  return [...videos, { key: malKey, name: "MyAnimeList trailer", type: "Trailer" }];
}

export function TrailerBlock({ item }: { item: MediaTitle }) {
  const videos = videosFor(item);
  const [active, setActive] = useState<Video | null>(null);

  if (videos.length === 0) {
    return null;
  }

  const still = artwork(item.backdropUrl ?? item.posterUrl, 780, "backdrop");

  return (
    <div className="detail-media">
      <div className="detail-media-frame">
        {active ? (
          <iframe
            key={active.key}
            src={`https://www.youtube-nocookie.com/embed/${active.key}?autoplay=1&rel=0&modestbranding=1`}
            title={`${item.title} — ${active.name}`}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="detail-media-play"
            onClick={() => setActive(videos[0])}
            aria-label={`Play ${videos[0].name}`}
          >
            {still && <img src={still} alt="" loading="lazy" decoding="async" />}
            <span className="detail-media-badge">
              <i>▶</i>{" "}
              {videos[0].type === "Trailer"
                ? "Play trailer"
                : `Play ${videos[0].type.toLowerCase()}`}
            </span>
          </button>
        )}
      </div>
      <div className="detail-media-picks">
        {videos.length > 1 &&
          videos.map((video) => (
            <button
              type="button"
              key={video.key}
              className={active?.key === video.key ? "selected" : ""}
              onClick={() => setActive(video)}
            >
              {video.name.length > 26 ? `${video.name.slice(0, 26)}…` : video.name}
            </button>
          ))}
        <a
          className="detail-media-out"
          href={`https://www.youtube.com/watch?v=${(active ?? videos[0]).key}`}
          target="_blank"
          rel="noreferrer"
        >
          Watch on YouTube ↗
        </a>
      </div>
    </div>
  );
}
