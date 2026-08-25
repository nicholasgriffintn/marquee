import type { MediaTitle } from "../../domain/catalog";
import { blendedRating } from "../../domain/ratings";
import { compactCount, moneyLabel, scoreLabel, votesLabel } from "../../lib/media";

function Score({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function ScoreRow({ item }: { item: MediaTitle }) {
  const consensus = blendedRating(item);
  const ratings = item.ratings;
  const anime = item.anime;
  const imdbVotes = ratings?.imdbVotes ? ` · ${votesLabel(ratings.imdbVotes)}` : "";
  const animeVotes = ratings?.animeVotes ? ` · ${votesLabel(ratings.animeVotes)}` : "";

  return (
    <>
      <div className="score-row">
        {consensus && consensus.sources.length > 1 && (
          <Score
            value={consensus.score.toFixed(1)}
            label={`Marquee consensus · ${consensus.sources.length} sources`}
          />
        )}
        <Score value={scoreLabel(item)} label="TMDB user score" />
        <Score value={item.tmdbVoteCount.toLocaleString()} label="TMDB votes" />
        {ratings?.imdbScore != null && (
          <Score value={ratings.imdbScore.toFixed(1)} label={`IMDb${imdbVotes}`} />
        )}
        {ratings?.rottenTomatoes && (
          <Score value={ratings.rottenTomatoes} label="Rotten Tomatoes" />
        )}
        {ratings?.metascore != null && <Score value={`${ratings.metascore}`} label="Metascore" />}
        {ratings?.animeScore != null && (
          <Score value={ratings.animeScore.toFixed(1)} label={`MyAnimeList${animeVotes}`} />
        )}
        {anime?.rank != null && (
          <Score value={`#${anime.rank.toLocaleString()}`} label="MyAnimeList rank" />
        )}
        {anime?.members != null && anime.members > 0 && (
          <Score value={compactCount(anime.members)} label="MyAnimeList members" />
        )}
        {ratings?.boxOffice != null && ratings.boxOffice > 0 && (
          <Score value={moneyLabel(ratings.boxOffice)} label="Box office" />
        )}
        {item.revenue != null && item.revenue > 0 && !ratings?.boxOffice && (
          <Score value={moneyLabel(item.revenue)} label="Worldwide gross" />
        )}
      </div>
      {ratings?.awards && (
        <div className="detail-awards">
          <span>Awards</span>
          <p>
            {ratings.awards}
            {ratings.awardWins
              ? ` · ${ratings.awardWins} win${ratings.awardWins === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
      )}
    </>
  );
}
