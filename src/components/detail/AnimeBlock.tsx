import type { AnimeDetails, MediaTitle } from "../../domain/catalog";

const FORMATS: Record<string, string> = {
  TV: "TV series",
  TV_SHORT: "Shorts",
  OVA: "OVA",
  ONA: "ONA",
  MOVIE: "Film",
  SPECIAL: "Special",
  MUSIC: "Music video",
};

const SOURCES: Record<string, string> = {
  MANGA: "from a manga",
  LIGHT_NOVEL: "from a light novel",
  VISUAL_NOVEL: "from a visual novel",
  NOVEL: "from a novel",
  ORIGINAL: "an original",
  VIDEO_GAME: "from a game",
  WEB_NOVEL: "from a web novel",
  DOUJINSHI: "from a doujinshi",
  ANIME: "from an earlier anime",
};

const RELATIONS: Record<string, string> = {
  PREQUEL: "Before this",
  SEQUEL: "After this",
  PARENT: "Part of",
  SIDE_STORY: "Alongside",
  SPIN_OFF: "Spin-off",
  ALTERNATIVE: "Another version",
  SUMMARY: "Recap",
};

const ORDER = ["PARENT", "PREQUEL", "SEQUEL", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "SUMMARY"];

function seasonLabel(anime: AnimeDetails) {
  if (!anime.season || !anime.seasonYear) {
    return "";
  }

  return `${anime.season.charAt(0)}${anime.season.slice(1).toLowerCase()} ${anime.seasonYear}`;
}

function factLine(anime: AnimeDetails) {
  return [
    anime.format ? (FORMATS[anime.format] ?? anime.format) : "",
    anime.episodes ? `${anime.episodes} episode${anime.episodes === 1 ? "" : "s"}` : "",
    anime.durationMinutes ? `${anime.durationMinutes} min each` : "",
    seasonLabel(anime),
    anime.source ? (SOURCES[anime.source] ?? "") : "",
  ].filter(Boolean);
}

export function AnimeBlock({ item }: { item: MediaTitle }) {
  const anime = item.anime;

  if (!anime) {
    return null;
  }

  const facts = factLine(anime);
  const official = anime.streams.filter((stream) => stream.site !== "YouTube");
  const related = [...anime.relations].sort(
    (left, right) => ORDER.indexOf(left.relation) - ORDER.indexOf(right.relation),
  );

  if (facts.length === 0 && official.length === 0 && related.length === 0) {
    return null;
  }

  return (
    <section className="anime-block" aria-label="What kind of anime this is">
      {facts.length > 0 && (
        <p className="anime-facts">
          {facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </p>
      )}

      {official.length > 0 && (
        <div className="anime-langs">
          <span className="anime-heading">Where the studio points</span>
          <ul>
            {official.map((stream) => (
              <li key={stream.url}>
                <a href={stream.url} target="_blank" rel="noreferrer">
                  {stream.site}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {related.length > 0 && (
        <div className="anime-order">
          <span className="anime-heading">Where this sits</span>
          <ul>
            {related.map((relation) => (
              <li key={relation.anilistId}>
                <em>{RELATIONS[relation.relation] ?? relation.relation}</em>
                <strong>{relation.title}</strong>
                {relation.year ? <small>{relation.year}</small> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
