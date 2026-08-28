import { useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { classNames } from "../lib/class-names";
import { artwork } from "../lib/media";
import { ExternalLinkIcon, PlayIcon } from "../ui";

import styles from "./TrailerBlock.module.css";

type Video = { key: string; name: string; type: string };

const YOUTUBE_ID_PATTERN = /^[\w-]{6,15}$/;

function videosFor(item: MediaTitle): Video[] {
  const videos = item.videos?.length
    ? item.videos
    : item.trailerKey
      ? [{ key: item.trailerKey, name: "Trailer", type: "Trailer" }]
      : [];
  const seen = new Set(videos.map((video) => video.key));
  const malVideos = (item.anime?.videos ?? [])
    .filter((video) => !seen.has(video.key))
    .map((video) => ({ key: video.key, name: video.name, type: "Trailer" }));

  return [...videos, ...malVideos];
}

export function TrailerBlock({ item }: { item: MediaTitle }) {
  const videos = videosFor(item).filter((video) => YOUTUBE_ID_PATTERN.test(video.key));
  const [active, setActive] = useState<Video | null>(null);

  if (videos.length === 0) {
    return null;
  }

  const still = artwork(item.backdropUrl ?? item.posterUrl, 780, "backdrop");

  return (
    <div className={styles.media}>
      <div className={styles.frame}>
        {active ? (
          <iframe
            key={active.key}
            src={`https://www.youtube-nocookie.com/embed/${active.key}?autoplay=1&rel=0&modestbranding=1`}
            title={`${item.title} — ${active.name}`}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            // oxlint-disable-next-line iframe-missing-sandbox -- cross-origin embed; the player needs both flags and our origin stays protected
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className={styles.play}
            onClick={() => setActive(videos[0])}
            aria-label={`Play ${videos[0].name}`}
          >
            {still && <img src={still} alt="" loading="lazy" decoding="async" />}
            <span className={styles.badge}>
              <i>
                <PlayIcon />
              </i>{" "}
              {videos[0].type === "Trailer"
                ? "Play trailer"
                : `Play ${videos[0].type.toLowerCase()}`}
            </span>
          </button>
        )}
      </div>
      <div className={styles.picks}>
        {videos.length > 1 &&
          videos.map((video) => (
            <button
              type="button"
              key={video.key}
              className={classNames(styles.pick, active?.key === video.key && styles.picked)}
              aria-pressed={active?.key === video.key}
              onClick={() => setActive(video)}
            >
              {video.name.length > 26 ? `${video.name.slice(0, 26)}…` : video.name}
            </button>
          ))}
        <a
          className={styles.out}
          href={`https://www.youtube.com/watch?v=${(active ?? videos[0]).key}`}
          target="_blank"
          rel="noreferrer"
        >
          Watch on YouTube <ExternalLinkIcon />
        </a>
      </div>
    </div>
  );
}
