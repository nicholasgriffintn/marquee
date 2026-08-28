import type { MediaTitle } from "../../domain/catalog";
import { blendedRating } from "../../domain/ratings";
import { compactCount, moneyLabel, scoreLabel, votesLabel } from "../../lib/media";
import { Stat, StatGrid, Text } from "../../ui";
import { DetailNote } from "./DetailNote";

import styles from "./ScoreRow.module.css";

export function ScoreRow({ item }: { item: MediaTitle }) {
  const consensus = blendedRating(item);
  const ratings = item.ratings;
  const anime = item.anime;
  const imdbVotes = ratings?.imdbVotes ? ` · ${votesLabel(ratings.imdbVotes)}` : "";
  const animeVotes = ratings?.animeVotes ? ` · ${votesLabel(ratings.animeVotes)}` : "";

  return (
    <>
      <StatGrid surface="paper" columns={2} className={styles.grid}>
        {consensus && consensus.sources.length > 1 && (
          <Stat
            value={consensus.score.toFixed(1)}
            label={`Marquee consensus · ${consensus.sources.length} sources`}
          />
        )}
        <Stat value={scoreLabel(item)} label="TMDB user score" />
        <Stat value={item.tmdbVoteCount.toLocaleString()} label="TMDB votes" />
        {ratings?.imdbScore != null && (
          <Stat value={ratings.imdbScore.toFixed(1)} label={`IMDb${imdbVotes}`} />
        )}
        {ratings?.rottenTomatoes && <Stat value={ratings.rottenTomatoes} label="Rotten Tomatoes" />}
        {ratings?.metascore != null && <Stat value={`${ratings.metascore}`} label="Metascore" />}
        {ratings?.animeScore != null && (
          <Stat value={ratings.animeScore.toFixed(1)} label={`MyAnimeList${animeVotes}`} />
        )}
        {anime?.rank != null && (
          <Stat value={`#${anime.rank.toLocaleString()}`} label="MyAnimeList rank" />
        )}
        {anime?.popularity != null && (
          <Stat value={`#${anime.popularity.toLocaleString()}`} label="MyAnimeList popularity" />
        )}
        {anime?.members != null && anime.members > 0 && (
          <Stat value={compactCount(anime.members)} label="MyAnimeList members" />
        )}
        {ratings?.boxOffice != null && ratings.boxOffice > 0 && (
          <Stat value={moneyLabel(ratings.boxOffice)} label="Box office" />
        )}
        {item.revenue != null && item.revenue > 0 && !ratings?.boxOffice && (
          <Stat value={moneyLabel(item.revenue)} label="Worldwide gross" />
        )}
      </StatGrid>
      {anime?.statusBreakdown && (
        <DetailNote label="MyAnimeList lists" accent="acid">
          <Text size="xs">
            {compactCount(anime.statusBreakdown.watching)} watching ·{" "}
            {compactCount(anime.statusBreakdown.completed)} completed ·{" "}
            {compactCount(anime.statusBreakdown.planToWatch)} planning ·{" "}
            {compactCount(anime.statusBreakdown.onHold)} on hold ·{" "}
            {compactCount(anime.statusBreakdown.dropped)} dropped
          </Text>
        </DetailNote>
      )}
    </>
  );
}
