import { episodeLabel, hasAired, type SeasonSummary } from "../../domain/seasons";
import type { SeasonsState } from "../../hooks/useSeasons";
import { artwork, artworkSrcSet } from "../../lib/media";
import { ArrowIcon, Eyebrow, Text } from "../../ui";

import styles from "./SeasonsRail.module.css";

const EPISODES_SHOWN = 5;

function runningSeasons(seasons: SeasonSummary[]) {
  return seasons.filter((season) => season.seasonNumber > 0 && season.episodeCount > 0);
}

export function SeasonsRail({
  seasons: state,
  onOpenSeason,
  onOpenAll,
}: {
  seasons: SeasonsState;
  onOpenSeason: (season: number) => void;
  onOpenAll: () => void;
}) {
  const listed = runningSeasons(state.seasons).toSorted(
    (left, right) => right.seasonNumber - left.seasonNumber,
  );

  if (listed.length === 0) {
    return null;
  }

  const newest = listed[0]?.seasonNumber ?? null;
  const detail = state.season;
  const aired = detail?.episodes.filter((episode) => hasAired(episode.airDate)) ?? [];
  const episodes = (aired.length > 0 ? aired : (detail?.episodes ?? []))
    .toSorted((left, right) => right.episodeNumber - left.episodeNumber)
    .slice(0, EPISODES_SHOWN);

  return (
    <section className={styles.block}>
      <Eyebrow size="sm" weight="heavy" tone="inkMuted">
        {listed.length} season{listed.length === 1 ? "" : "s"}
      </Eyebrow>
      <ul className={styles.rail}>
        {listed.map((season) => (
          <li key={season.seasonNumber}>
            <button
              type="button"
              className={styles.season}
              onClick={() => onOpenSeason(season.seasonNumber)}
            >
              {season.posterUrl ? (
                <img
                  className={styles.poster}
                  src={artwork(season.posterUrl, 92) ?? season.posterUrl}
                  srcSet={artworkSrcSet(season.posterUrl, 92)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className={styles.poster} aria-hidden="true" />
              )}
              <span className={styles.seasonText}>
                <strong>Season {season.seasonNumber}</strong>
                <small>
                  {season.episodeCount} episode{season.episodeCount === 1 ? "" : "s"}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {episodes.length > 0 && detail && (
        <>
          <Eyebrow size="sm" weight="heavy" tone="inkMuted">
            {detail.seasonNumber === newest ? "Latest episodes" : `Season ${detail.seasonNumber}`}
          </Eyebrow>
          <ul className={styles.episodes}>
            {episodes.map((episode) => (
              <li key={episode.episodeNumber}>
                <button
                  type="button"
                  className={styles.episode}
                  onClick={() => onOpenSeason(episode.seasonNumber)}
                >
                  <em>{episodeLabel(episode.seasonNumber, episode.episodeNumber)}</em>
                  <span>{episode.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className={styles.all} onClick={onOpenAll}>
        <Text size="sm" as="span">
          All episodes and seasons
        </Text>
        <ArrowIcon />
      </button>
    </section>
  );
}
