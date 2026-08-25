import { useState } from "react";
import { Link } from "react-router-dom";

import { useTitleCredits, type CreditSeason, type TitleCredit } from "../../hooks/useTitleCredits";
import { Dropdown, type DropdownOption } from "../ui";

const CREW_ORDER = [
  "Director",
  "Creator",
  "Screenplay",
  "Writer",
  "Story",
  "Novel",
  "Original Music Composer",
  "Music",
  "Director of Photography",
  "Editor",
  "Production Design",
  "Costume Design",
  "Producer",
  "Executive Producer",
  "Casting",
];

function byJob(crew: TitleCredit[]) {
  const grouped = new Map<string, string[]>();

  for (const credit of crew) {
    if (!credit.job) {
      continue;
    }

    grouped.set(credit.job, [...(grouped.get(credit.job) ?? []), credit.name]);
  }

  return [...grouped.entries()].sort((left, right) => {
    const leftRank = CREW_ORDER.indexOf(left[0]);
    const rightRank = CREW_ORDER.indexOf(right[0]);

    return (
      (leftRank < 0 ? CREW_ORDER.length : leftRank) -
      (rightRank < 0 ? CREW_ORDER.length : rightRank)
    );
  });
}

export function CreditsBlock({ titleId }: { titleId: string }) {
  const [season, setSeason] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const { credits, isLoading } = useTitleCredits(titleId, season, page);
  const { cast, crew, hasMore, total } = credits;
  const [seasons, setSeasons] = useState<CreditSeason[]>([]);

  if (credits.seasons.length > 0 && credits.seasons !== seasons) {
    setSeasons(credits.seasons);
  }

  if (cast.length === 0 && crew.length === 0 && seasons.length === 0) {
    return null;
  }

  const jobs = byJob(crew);
  const choose = (next: number | null) => {
    setSeason(next);
    setPage(1);
  };

  const seasonOptions: DropdownOption[] = [
    { key: "series", selected: season === null, content: "The series" },
    ...seasons.map((entry) => ({
      key: String(entry.season),
      selected: season === entry.season,
      content: `Season ${entry.season}`,
    })),
  ];

  return (
    <section className="detail-credits" aria-labelledby="detail-credits-title">
      <h3 id="detail-credits-title">Who made it{total > 0 ? ` · ${total} credited` : ""}</h3>
      {seasons.length > 0 && (
        <Dropdown
          label="Choose a season"
          className="credit-season-dropdown"
          trigger={seasonOptions.find((option) => option.selected)?.content}
          options={seasonOptions}
          onSelect={(key) => choose(key === "series" ? null : Number(key))}
        />
      )}
      {jobs.length === 0 && cast.length === 0 && (
        <p className="detail-credits-empty">
          {isLoading ? "Reading…" : "Not read yet."}
        </p>
      )}
      {jobs.length > 0 && (
        <dl className="detail-crew">
          {jobs.map(([job, names]) => (
            <div key={job}>
              <dt>{job}</dt>
              <dd>
                {names.map((name, index) => (
                  <span key={`${job}-${name}`}>
                    {index > 0 ? ", " : ""}
                    <Link to={`/person/${encodeURIComponent(name)}`}>{name}</Link>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {cast.length > 0 && (
        <ul className="detail-cast">
          {cast.map((credit) => (
            <li key={`${credit.personId}-${credit.episodeNumber ?? "s"}`}>
              <Link to={`/person/${encodeURIComponent(credit.name)}`}>
                <strong>{credit.name}</strong>
                {credit.character ? <small>{credit.character}</small> : null}
                {credit.episodeNumber !== null ? (
                  <small>Episode {credit.episodeNumber}</small>
                ) : credit.episodeCount ? (
                  <small>{credit.episodeCount} episodes</small>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || hasMore) && (
        <div className="detail-credit-pager">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Back
          </button>
          <span>Page {page}</span>
          <button type="button" disabled={!hasMore} onClick={() => setPage(page + 1)}>
            More
          </button>
        </div>
      )}
    </section>
  );
}
