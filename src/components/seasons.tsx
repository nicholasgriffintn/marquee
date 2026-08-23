import { useState } from "react";

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
import { useEpisodeEntries, useSeasons, type EpisodePatch } from "../hooks/useSeasons";
import { artwork, artworkSrcSet } from "../lib/media";
import { ArrowIcon } from "./ui";

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
    <div className="episode-stars" aria-label={label}>
      {STARS.map((star) => (
        <button
          type="button"
          key={star}
          className={(rating ?? 0) >= star ? "active" : ""}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          aria-pressed={rating === star}
          onClick={() => onRate(rating === star ? null : star)}
        >
          ★
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
      <div className="episode-note-rest">
        {notes ? <p>{notes}</p> : null}
        <button type="button" className="episode-note-open" onClick={() => setDraft(notes)}>
          {notes ? "Edit note" : "Add a note"}
        </button>
      </div>
    );
  }

  return (
    <div className="episode-note">
      <textarea
        maxLength={2_000}
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="episode-note-actions">
        <button
          type="button"
          onClick={() => {
            onSave(draft.trim());
            setDraft(null);
          }}
        >
          Save note
        </button>
        <button type="button" className="quiet" onClick={() => setDraft(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function EpisodeRow({
  episode,
  entry,
  canTrack,
  onSave,
  onMarkThrough,
}: {
  episode: Episode;
  entry: EpisodeEntry | null;
  canTrack: boolean;
  onSave: (patch: EpisodePatch) => void;
  onMarkThrough: (episodeNumber: number) => void;
}) {
  const aired = hasAired(episode.airDate);
  const watched = entry?.watched ?? false;
  const meta = [
    airLabel(episode.airDate),
    runtimeLabel(episode.runtimeMinutes),
    episode.tmdbScore ? `TMDB ${episode.tmdbScore.toFixed(1)}` : "",
  ].filter(Boolean);
  const patch: EpisodePatch = { season: episode.seasonNumber, episode: episode.episodeNumber };

  return (
    <li
      className={`episode-row${canTrack ? "" : " plain"}${watched ? " watched" : ""}${aired ? "" : " unaired"}`}
    >
      {canTrack && (
        <button
          type="button"
          className="episode-tick"
          aria-pressed={watched}
          aria-label={`${watched ? "Unmark" : "Mark"} ${episodeLabel(episode.seasonNumber, episode.episodeNumber)} as watched`}
          onClick={() => onSave({ ...patch, watched: !watched })}
        >
          {watched ? "✓" : ""}
        </button>
      )}
      <div className="episode-body">
        <div className="episode-head">
          <strong>
            <em>{episodeLabel(episode.seasonNumber, episode.episodeNumber)}</em> {episode.name}
          </strong>
          <small>{meta.join(" · ")}</small>
        </div>
        {episode.stillUrl && (
          <img
            className="episode-still"
            src={artwork(episode.stillUrl, 320, "backdrop") ?? episode.stillUrl}
            srcSet={artworkSrcSet(episode.stillUrl, 320, "backdrop")}
            alt=""
            loading="lazy"
            decoding="async"
          />
        )}
        {episode.overview && <p className="episode-overview">{episode.overview}</p>}
        {canTrack && (
          <div className="episode-actions">
            <StarRow
              label={`Rate ${episode.name}`}
              rating={entry?.rating ?? null}
              onRate={(rating) => onSave({ ...patch, rating, watched: rating ? true : watched })}
            />
            {aired && !watched && (
              <button
                type="button"
                className="episode-through"
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
    <div className="season-head">
      <div className="season-head-copy">
        <h4>{seasonLabel(summary.seasonNumber, summary.name)}</h4>
        <p>
          {total ? `${total} episode${total === 1 ? "" : "s"}` : "Episode count unknown"}
          {summary.airDate ? ` · first shown ${airLabel(summary.airDate)}` : ""}
          {aired > 0 && canTrack ? ` · ${watched} of ${aired} aired watched` : ""}
        </p>
        {overview && <p className="season-overview">{overview}</p>}
      </div>
      {canTrack && aired > 0 && (
        <div className="season-track">
          <div className="season-bar" role="presentation">
            <i style={{ width: `${percent}%` }} />
          </div>
          <div className="season-track-actions">
            <button type="button" onClick={() => onMarkSeason(watched < aired)}>
              {watched < aired ? "Mark the series watched" : "Clear the series"}
            </button>
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

export function SeasonsBlock({ item, canTrack }: { item: MediaTitle; canTrack: boolean }) {
  const tracker = useEpisodeEntries(item.id, canTrack);
  const { seasons, season, selected, selectSeason, isLoading, isLoadingSeason, error } = useSeasons(
    item,
    true,
    tracker.progress,
  );
  const summary = seasons.find((entry) => entry.seasonNumber === selected) ?? null;

  if (isLoading && seasons.length === 0) {
    return (
      <section className="seasons-block">
        <span className="seasons-label">Series and episodes</span>
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line short" />
      </section>
    );
  }

  if (seasons.length === 0) {
    return null;
  }

  const progress = tracker.progress;
  const seasonStats = progress?.seasons.find((entry) => entry.season === selected) ?? null;
  const aired =
    seasonStats?.aired ??
    season?.episodes.filter((episode) => hasAired(episode.airDate)).length ??
    0;
  const watchedHere = seasonStats?.watched ?? 0;

  return (
    <section className="seasons-block">
      <div className="seasons-top">
        <span className="seasons-label">Series and episodes</span>
        {canTrack && progress && progress.aired > 0 && (
          <p className="seasons-progress">
            {progress.watched} of {progress.aired} aired episodes watched
            {progress.upNext
              ? ` · up next ${episodeLabel(progress.upNext.season, progress.upNext.episode)}`
              : " · you are all caught up"}
            {progress.upNext && progress.upNext.season !== selected ? (
              <button
                type="button"
                className="seasons-jump"
                onClick={() => selectSeason(progress.upNext?.season ?? null)}
              >
                Take me there <ArrowIcon />
              </button>
            ) : null}
          </p>
        )}
      </div>

      <div className="season-tabs">
        {seasons.map((entry) => {
          const stats = progress?.seasons.find((row) => row.season === entry.seasonNumber) ?? null;
          const done = stats && stats.aired > 0 && stats.watched >= stats.aired;

          return (
            <button
              type="button"
              key={entry.seasonNumber}
              className={`season-tab${entry.seasonNumber === selected ? " selected" : ""}${done ? " done" : ""}`}
              aria-pressed={entry.seasonNumber === selected}
              onClick={() => selectSeason(entry.seasonNumber)}
            >
              {entry.seasonNumber === 0 ? "Specials" : `Series ${entry.seasonNumber}`}
              {stats && stats.watched > 0 ? <em>{done ? "✓" : stats.watched}</em> : null}
            </button>
          );
        })}
      </div>

      {summary && (
        <SeasonHeader
          summary={summary}
          detail={season}
          watched={watchedHere}
          aired={aired}
          entry={seasonEntryFor(tracker.entries, summary.seasonNumber)}
          canTrack={canTrack}
          onSave={(patch) => void tracker.save(patch)}
          onMarkSeason={(watched) => void tracker.mark(summary.seasonNumber, watched)}
        />
      )}

      {tracker.message && <p className="seasons-message">{tracker.message}</p>}
      {error && !season && <p className="seasons-message">{error}</p>}

      {isLoadingSeason && (
        <div className="season-loading">
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line short" />
        </div>
      )}

      {season && season.episodes.length === 0 && (
        <p className="seasons-empty">Nothing announced for this one yet.</p>
      )}

      {season && (
        <ol className="episode-list">
          {season.episodes.map((episode) => (
            <EpisodeRow
              key={`${episode.seasonNumber}-${episode.episodeNumber}`}
              episode={episode}
              entry={episodeEntryFor(tracker.entries, episode.seasonNumber, episode.episodeNumber)}
              canTrack={canTrack}
              onSave={(patch) => void tracker.save(patch)}
              onMarkThrough={(episodeNumber) =>
                void tracker.mark(episode.seasonNumber, true, episodeNumber)
              }
            />
          ))}
        </ol>
      )}

      {!canTrack && (
        <p className="seasons-signed-out">
          Sign in and you can tick these off, rate them and keep notes against each one.
        </p>
      )}
    </section>
  );
}
