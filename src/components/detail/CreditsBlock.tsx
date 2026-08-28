import { useState } from "react";
import { Link } from "react-router-dom";

import { personPath } from "../../domain/catalog";
import { useTitleCredits, type CreditSeason, type TitleCredit } from "../../hooks/useTitleCredits";
import { Dropdown, Heading, StatusNote, type DropdownOption } from "../../ui";
import { DetailCredit } from "./DetailNote";

import styles from "./CreditsBlock.module.css";

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

  return [...grouped.entries()].toSorted((left, right) => {
    const leftRank = CREW_ORDER.indexOf(left[0]);
    const rightRank = CREW_ORDER.indexOf(right[0]);

    return (
      (leftRank < 0 ? CREW_ORDER.length : leftRank) -
      (rightRank < 0 ? CREW_ORDER.length : rightRank)
    );
  });
}

export function CreditsBlock({ titleId, people }: { titleId: string; people: string[] }) {
  const [season, setSeason] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const { credits, isLoading } = useTitleCredits(titleId, season, page);
  const { cast, crew, hasMore, total } = credits;
  const [seasons, setSeasons] = useState<CreditSeason[]>([]);
  const [seriesCredits, setSeriesCredits] = useState<number | null>(null);

  if (credits.seasons.length > 0 && credits.seasons !== seasons) {
    setSeasons(credits.seasons);
  }

  if (season === null && !isLoading && seriesCredits !== total) {
    setSeriesCredits(total);
  }

  const opener =
    seasons.find((entry) => entry.credits > 0) ??
    seasons.find((entry) => entry.season > 0) ??
    seasons[0];

  if (season === null && seriesCredits === 0 && opener) {
    setSeason(opener.season);
  }

  const jobs = byJob(crew);
  const billed = !isLoading && cast.length === 0 && jobs.length === 0 ? people : [];
  const bare = cast.length === 0 && jobs.length === 0 && billed.length === 0;

  if (bare && !isLoading && seasons.length === 0 && people.length === 0) {
    return null;
  }

  const choose = (next: number | null) => {
    setSeason(next);
    setPage(1);
  };

  const seasonOptions: DropdownOption[] = [
    ...(seriesCredits === 0 && seasons.length > 0
      ? []
      : [{ key: "series", selected: season === null, content: "The series" }]),
    ...seasons.map((entry) => ({
      key: String(entry.season),
      selected: season === entry.season,
      content: `Season ${entry.season}`,
    })),
  ];

  return (
    <section className={styles.credits} aria-labelledby="detail-credits-title">
      <Heading level={3} size="label" tone="inkMuted" id="detail-credits-title">
        Who made it{total > 0 ? ` · ${total} credited` : ""}
      </Heading>
      {seasons.length > 0 && (
        <Dropdown
          label="Choose a season"
          size="compact"
          trigger={seasonOptions.find((option) => option.selected)?.content}
          options={seasonOptions}
          onSelect={(key) => choose(key === "series" ? null : Number(key))}
        />
      )}
      {bare && (
        <StatusNote busy={isLoading} surface="paper">
          {isLoading ? "Reading…" : "Not read yet."}
        </StatusNote>
      )}
      {billed.length > 0 && (
        <>
          <ul className={styles.cast}>
            {billed.map((name) => (
              <li key={name}>
                <Link to={personPath(name)}>
                  <strong>{name}</strong>
                </Link>
              </li>
            ))}
          </ul>
          <DetailCredit>
            Top billing for the title from TMDB. The full credits are not read yet.
          </DetailCredit>
        </>
      )}
      {jobs.length > 0 && (
        <dl className={styles.crew}>
          {jobs.map(([job, names]) => (
            <div key={job}>
              <dt>{job}</dt>
              <dd>
                {names.map((name, index) => (
                  <span key={`${job}-${name}`}>
                    {index > 0 ? ", " : ""}
                    <Link to={personPath(name)}>{name}</Link>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {cast.length > 0 && (
        <ul className={styles.cast}>
          {cast.map((credit) => (
            <li key={`${credit.personId}-${credit.episodeNumber ?? "s"}`}>
              <Link to={personPath(credit.name)}>
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
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.pagerButton}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Back
          </button>
          <span className={styles.pagerLabel}>Page {page}</span>
          <button
            type="button"
            className={styles.pagerButton}
            disabled={!hasMore}
            onClick={() => setPage(page + 1)}
          >
            More
          </button>
        </div>
      )}
    </section>
  );
}
