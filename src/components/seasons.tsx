import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import {
  airLabel,
  episodeEntryFor,
  episodeLabel,
  hasAired,
  runtimeLabel,
  seasonEntryFor,
  seasonLabel,
  type Episode,
  type EpisodeEntry,
  type SeasonDetail,
  type SeasonSummary,
} from "../domain/seasons";
import { useSeasons, type EpisodePatch, type EpisodeTracker } from "../hooks/useSeasons";
import { classNames } from "../lib/class-names";
import { artwork, artworkSrcSet } from "../lib/media";
import {
  ArrowIcon,
  Button,
  CheckIcon,
  ChevronIcon,
  Dropdown,
  Eyebrow,
  Heading,
  Skeleton,
  StarIcon,
  Text,
  TextArea,
  type DropdownOption,
} from "../ui";

import styles from "./seasons.module.css";

const STARS = [1, 2, 3, 4, 5];

function StarRow({
  label,
  rating,
  onRate,
}: {
  label: string;
  rating: number | null;
  onRate: (rating: number | null) => void;
}) {
  return (
    <div className={styles.stars} aria-label={label}>
      {STARS.map((star) => (
        <button
          type="button"
          key={star}
          className={classNames(styles.star, (rating ?? 0) >= star && styles.starOn)}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          aria-pressed={rating === star}
          onClick={() => onRate(rating === star ? null : star)}
        >
          <StarIcon />
        </button>
      ))}
    </div>
  );
}

function NoteEditor({
  label,
  notes,
  placeholder,
  onSave,
}: {
  label: string;
  notes: string;
  placeholder: string;
  onSave: (notes: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <div className={styles.noteRest}>
        {notes ? <p className={styles.noteText}>{notes}</p> : null}
        <button type="button" className={styles.noteOpen} onClick={() => setDraft(notes)}>
          {notes ? "Edit note" : "Add a note"}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.note}>
      <TextArea
        surface="paper"
        className={styles.noteInput}
        maxLength={2_000}
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className={styles.noteActions}>
        <Button
          variant="primary"
          size="sm"
          surface="paper"
          onClick={() => {
            onSave(draft.trim());
            setDraft(null);
          }}
        >
          Save note
        </Button>
        <Button variant="secondary" size="sm" surface="paper" onClick={() => setDraft(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function EpisodeRow({
  episode,
  entry,
  canTrack,
  open,
  onToggle,
  onSave,
  onMarkThrough,
}: {
  episode: Episode;
  entry: EpisodeEntry | null;
  canTrack: boolean;
  open: boolean;
  onToggle: () => void;
  onSave: (patch: EpisodePatch) => void;
  onMarkThrough: (episodeNumber: number) => void;
}) {
  const aired = hasAired(episode.airDate);
  const watched = entry?.watched ?? false;
  const meta = [
    airLabel(episode.airDate),
    runtimeLabel(episode.runtimeMinutes),
    episode.tmdbScore ? `TMDB ${episode.tmdbScore.toFixed(1)}` : "",
    episode.imdbScore ? `IMDb ${episode.imdbScore.toFixed(1)}` : "",
  ].filter(Boolean);
  const patch: EpisodePatch = { season: episode.seasonNumber, episode: episode.episodeNumber };
  const label = episodeLabel(episode.seasonNumber, episode.episodeNumber);
  const marked = Boolean(entry?.rating || entry?.notes.trim());
  const panelId = `episode-${episode.seasonNumber}-${episode.episodeNumber}`;

  return (
    <li
      className={classNames(
        styles.row,
        !canTrack && styles.rowPlain,
        watched && styles.rowWatched,
        !aired && styles.rowUnaired,
      )}
    >
      {canTrack && (
        <button
          type="button"
          className={styles.tick}
          aria-pressed={watched}
          aria-label={`${watched ? "Unmark" : "Mark"} ${label} as watched`}
          onClick={() => onSave({ ...patch, watched: !watched })}
        >
          {watched ? <CheckIcon /> : null}
        </button>
      )}
      <div className={styles.body}>
        <button
          type="button"
          className={styles.head}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>
            <strong>
              <em>{label}</em> {episode.name}
            </strong>
            <small>{meta.join(" · ")}</small>
          </span>
          {marked && !open && <i className={styles.marked} aria-hidden="true" />}
          <ChevronIcon />
        </button>
        {open && (
          <div className={styles.detail} id={panelId}>
            {episode.stillUrl && (
              <img
                className={styles.still}
                src={artwork(episode.stillUrl, 320, "backdrop") ?? episode.stillUrl}
                srcSet={artworkSrcSet(episode.stillUrl, 320, "backdrop")}
                alt=""
                loading="lazy"
                decoding="async"
              />
            )}
            {episode.overview && <p className={styles.overview}>{episode.overview}</p>}
            {canTrack && (
              <div className={styles.actions}>
                <StarRow
                  label={`Rate ${episode.name}`}
                  rating={entry?.rating ?? null}
                  onRate={(rating) =>
                    onSave({ ...patch, rating, watched: rating ? true : watched })
                  }
                />
                {aired && !watched && (
                  <button
                    type="button"
                    className={styles.through}
                    onClick={() => onMarkThrough(episode.episodeNumber)}
                  >
                    I am up to here
                  </button>
                )}
              </div>
            )}
            {canTrack && (
              <NoteEditor
                label={`Notes on ${episode.name}`}
                notes={entry?.notes ?? ""}
                placeholder="What did you make of it?"
                onSave={(notes) => onSave({ ...patch, notes })}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function SeasonHeader({
  summary,
  detail,
  watched,
  aired,
  entry,
  canTrack,
  onSave,
  onMarkSeason,
}: {
  summary: SeasonSummary;
  detail: SeasonDetail | null;
  watched: number;
  aired: number;
  entry: EpisodeEntry | null;
  canTrack: boolean;
  onSave: (patch: EpisodePatch) => void;
  onMarkSeason: (watched: boolean) => void;
}) {
  const total = detail?.episodes.length || summary.episodeCount;
  const percent = aired > 0 ? Math.round((Math.min(watched, aired) / aired) * 100) : 0;
  const overview = detail?.overview || summary.overview;

  return (
    <div className={styles.seasonHead}>
      <div>
        <Heading level={4} size="compact" family="serif" className={styles.seasonName}>
          {seasonLabel(summary.seasonNumber, summary.name)}
        </Heading>
        <Text size="xs" tone="inkMuted">
          {total ? `${total} episode${total === 1 ? "" : "s"}` : "Episode count unknown"}
          {summary.airDate ? ` · first shown ${airLabel(summary.airDate)}` : ""}
          {aired > 0 && canTrack ? ` · ${watched} of ${aired} watched so far` : ""}
        </Text>
        {overview && (
          <Text size="sm" className={styles.seasonOverview}>
            {overview}
          </Text>
        )}
      </div>
      {canTrack && aired > 0 && (
        <div className={styles.track}>
          <div className={styles.bar} role="presentation">
            <i style={{ width: `${percent}%` }} />
          </div>
          <div className={styles.trackActions}>
            <Button
              variant="secondary"
              size="sm"
              surface="paper"
              onClick={() => onMarkSeason(watched < aired)}
            >
              {watched < aired ? "Mark the series watched" : "Clear the series"}
            </Button>
          </div>
          <StarRow
            label={`Rate ${seasonLabel(summary.seasonNumber, summary.name)}`}
            rating={entry?.rating ?? null}
            onRate={(rating) => onSave({ scope: "season", season: summary.seasonNumber, rating })}
          />
          <NoteEditor
            label={`Notes on ${seasonLabel(summary.seasonNumber, summary.name)}`}
            notes={entry?.notes ?? ""}
            placeholder="How did the run hold up?"
            onSave={(notes) => onSave({ scope: "season", season: summary.seasonNumber, notes })}
          />
        </div>
      )}
    </div>
  );
}

export function SeasonsBlock({
  item,
  canTrack,
  shelved,
  tracker,
  jumpTo,
  onTracked,
}: {
  item: MediaTitle;
  canTrack: boolean;
  shelved: boolean;
  tracker: EpisodeTracker;
  jumpTo: { season: number; nonce: number } | null;
  onTracked?: () => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const save = (patch: EpisodePatch) =>
    void tracker.save(patch).then((saved) => saved && onTracked?.());
  const mark = (season: number, watched: boolean, through: number | null = null) =>
    void tracker.mark(season, watched, through).then((marked) => marked && onTracked?.());
  const { seasons, season, selected, selectSeason, isLoading, isLoadingSeason, error } = useSeasons(
    item,
    true,
    tracker.progress,
  );
  const summary = seasons.find((candidate) => candidate.seasonNumber === selected) ?? null;
  const nonce = jumpTo?.nonce ?? null;
  const jumpSeason = jumpTo?.season ?? null;

  useEffect(() => {
    if (nonce !== null && jumpSeason !== null) {
      selectSeason(jumpSeason);
    }
  }, [nonce, jumpSeason, selectSeason]);

  const invite =
    canTrack && !shelved ? (
      <Text size="sm" className={styles.invite}>
        Tick an episode, rate one or keep a note and the show goes on your shelf by itself.
      </Text>
    ) : null;

  if (isLoading && seasons.length === 0) {
    return (
      <section className={styles.block}>
        <Eyebrow size="sm" weight="heavy" tracking="wide" tone="inkMuted">
          Series and episodes
        </Eyebrow>
        <Skeleton />
        <Skeleton short />
      </section>
    );
  }

  if (seasons.length === 0) {
    return (
      <section className={styles.block}>
        <Text size="sm" tone="inkMuted" italic>
          No episode guide for this one yet.
        </Text>
      </section>
    );
  }

  const progress = tracker.progress;
  const seasonStats = progress?.seasons.find((row) => row.season === selected) ?? null;
  const aired =
    seasonStats?.aired ??
    season?.episodes.filter((episode) => hasAired(episode.airDate)).length ??
    0;
  const watchedHere = seasonStats?.watched ?? 0;

  const seasonOptions: DropdownOption[] = seasons.map((tab) => {
    const stats = progress?.seasons.find((row) => row.season === tab.seasonNumber) ?? null;
    const done = stats && stats.aired > 0 && stats.watched >= stats.aired;

    return {
      key: String(tab.seasonNumber),
      selected: tab.seasonNumber === selected,
      content: (
        <>
          {tab.seasonNumber === 0 ? "Specials" : `Series ${tab.seasonNumber}`}
          {stats && stats.watched > 0 ? <em>{done ? <CheckIcon /> : stats.watched}</em> : null}
        </>
      ),
    };
  });

  return (
    <section className={styles.block}>
      <div className={styles.top}>
        <Eyebrow size="sm" weight="heavy" tracking="wide" tone="inkMuted">
          Series and episodes
        </Eyebrow>
        {canTrack && progress && progress.aired > 0 && (
          <p className={styles.progress}>
            {progress.watched} of {progress.aired} episodes watched so far
            {progress.upNext
              ? ` · up next ${episodeLabel(progress.upNext.season, progress.upNext.episode)}`
              : " · you are all caught up"}
            {progress.upNext && progress.upNext.season !== selected ? (
              <button
                type="button"
                className={styles.jump}
                onClick={() => selectSeason(progress.upNext?.season ?? null)}
              >
                Take me there <ArrowIcon />
              </button>
            ) : null}
          </p>
        )}
        {invite}
      </div>

      <Dropdown
        label="Choose a series"
        trigger={seasonOptions.find((option) => option.selected)?.content}
        options={seasonOptions}
        onSelect={(key) => selectSeason(Number(key))}
      />

      {summary && (
        <SeasonHeader
          summary={summary}
          detail={season}
          watched={watchedHere}
          aired={aired}
          entry={seasonEntryFor(tracker.entries, summary.seasonNumber)}
          canTrack={canTrack}
          onSave={save}
          onMarkSeason={(watched) => mark(summary.seasonNumber, watched)}
        />
      )}

      {tracker.message && (
        <Text size="sm" tone="warning">
          {tracker.message}
        </Text>
      )}
      {error && !season && (
        <Text size="sm" tone="warning">
          {error}
        </Text>
      )}

      {isLoadingSeason && (
        <div className={styles.loading}>
          <Skeleton />
          <Skeleton short />
        </div>
      )}

      {season && season.episodes.length === 0 && (
        <Text size="sm" tone="inkMuted" italic>
          Nothing announced for this one yet.
        </Text>
      )}

      {season && (
        <ol className={styles.list}>
          {season.episodes.map((episode) => {
            const key = `${episode.seasonNumber}-${episode.episodeNumber}`;

            return (
              <EpisodeRow
                key={key}
                episode={episode}
                entry={episodeEntryFor(
                  tracker.entries,
                  episode.seasonNumber,
                  episode.episodeNumber,
                )}
                canTrack={canTrack}
                open={expanded.has(key)}
                onToggle={() =>
                  setExpanded((current) => {
                    const next = new Set(current);

                    if (!next.delete(key)) {
                      next.add(key);
                    }

                    return next;
                  })
                }
                onSave={save}
                onMarkThrough={(episodeNumber) => mark(episode.seasonNumber, true, episodeNumber)}
              />
            );
          })}
        </ol>
      )}

      {!canTrack && (
        <Text size="sm" tone="inkMuted" italic>
          Sign in and you can tick these off, rate them and keep notes against each one.
        </Text>
      )}
    </section>
  );
}
