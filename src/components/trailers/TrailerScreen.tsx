import { useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";

import { titlePath, type MediaTitle } from "../../domain/catalog";
import { ENTRY_STATUS_LABELS } from "../../domain/entries";
import type { ProfileEntryState } from "../../domain/profile-entry";
import { trailerStill, type TrailerCard, type TrailerStillSize } from "../../domain/trailers";
import { formatDaysAgo } from "../../lib/dates";
import { compactCount, mediaMeta } from "../../lib/media";
import { isModifiedClick } from "../../lib/navigation";
import {
  ArrowIcon,
  Button,
  ButtonLink,
  CheckIcon,
  ChevronIcon,
  ExternalLinkIcon,
  PlayIcon,
  PlusIcon,
} from "../../ui";
import { TitleArt } from "../TitleArt";

import styles from "./TrailerScreen.module.css";

const STILL_WIDTH = 1280;
const PLACEHOLDER_STILL_WIDTH = 320;

function Still({ trailer }: { trailer: TrailerCard }) {
  const [size, setSize] = useState<TrailerStillSize | "art">("maxres");

  if (size === "art") {
    return (
      <TitleArt
        url={trailer.item.backdropUrl ?? trailer.item.posterUrl}
        seed={trailer.item.id}
        label={trailer.item.title}
        width={STILL_WIDTH}
        kind="backdrop"
        wide
        eager
      />
    );
  }

  return (
    <img
      src={trailerStill(trailer.key, size)}
      alt=""
      decoding="async"
      onLoad={(event) => {
        if (size === "maxres" && event.currentTarget.naturalWidth < PLACEHOLDER_STILL_WIDTH) {
          setSize("hq");
        }
      }}
      onError={() => setSize(size === "maxres" ? "hq" : "art")}
    />
  );
}

function ShelfAction({
  item,
  isSignedIn,
  entryState,
  onSave,
}: {
  item: MediaTitle;
  isSignedIn: boolean;
  entryState: ProfileEntryState | undefined;
  onSave: (title: MediaTitle) => void;
}) {
  if (!isSignedIn) {
    return (
      <ButtonLink to={`/sign-in?returnTo=${encodeURIComponent("/trailers")}`} variant="secondary">
        Sign in to save it
      </ButtonLink>
    );
  }

  if (entryState?.status === "loaded" && entryState.entry) {
    return (
      <span className={styles.shelved}>
        <CheckIcon /> {ENTRY_STATUS_LABELS[entryState.entry.status]}
      </span>
    );
  }

  if (entryState?.status === "loaded") {
    return (
      <Button variant="secondary" onClick={() => onSave(item)}>
        <PlusIcon /> Save to my shelf
      </Button>
    );
  }

  return (
    <span className={styles.shelfNote} aria-live="polite">
      {entryState?.status === "error" ? "Your shelf could not be checked." : "Checking your shelf…"}
    </span>
  );
}

export function TrailerScreen({
  trailer,
  position,
  total,
  playing,
  isSignedIn,
  entryState,
  onPlay,
  onStep,
  onOpen,
  onSave,
}: {
  trailer: TrailerCard;
  position: number;
  total: number;
  playing: boolean;
  isSignedIn: boolean;
  entryState: ProfileEntryState | undefined;
  onPlay: () => void;
  onStep: (direction: 1 | -1) => void;
  onOpen: (title: MediaTitle) => void;
  onSave: (title: MediaTitle) => void;
}) {
  const { item } = trailer;

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onStep(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      onStep(-1);
    }
  }

  return (
    <section className={styles.screen} aria-label="Now showing">
      <div className={styles.frame}>
        {playing ? (
          <iframe
            key={trailer.key}
            src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0&modestbranding=1`}
            title={`${item.title} — ${trailer.name}`}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            // oxlint-disable-next-line iframe-missing-sandbox -- cross-origin embed; the player needs both flags and our origin stays protected
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className={styles.play}
            onClick={onPlay}
            onKeyDown={onKeyDown}
            aria-label={`Play ${trailer.name} for ${item.title}`}
          >
            <Still key={trailer.key} trailer={trailer} />
            <span className={styles.badge}>
              <i>
                <PlayIcon />
              </i>{" "}
              Play {trailer.type.toLowerCase()}
            </span>
          </button>
        )}
      </div>
      <div className={styles.bill}>
        <div className={styles.billMain}>
          <span className={styles.count}>
            {trailer.type} · {position} of {total}
          </span>
          <Link
            to={titlePath(item)}
            viewTransition
            className={styles.title}
            onClick={(event) => {
              if (isModifiedClick(event)) {
                return;
              }

              event.preventDefault();
              onOpen(item);
            }}
          >
            {item.title}
          </Link>
          <span className={styles.meta}>{mediaMeta(item)}</span>
          <span className={styles.facts}>
            <b>{formatDaysAgo(trailer.publishedAt)}</b>
            {trailer.views ? <em>{compactCount(trailer.views)} views</em> : null}
            <a
              href={`https://www.youtube.com/watch?v=${trailer.key}`}
              target="_blank"
              rel="noreferrer"
            >
              Watch on YouTube <ExternalLinkIcon />
            </a>
          </span>
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => onOpen(item)}>
              Open the programme <ArrowIcon />
            </Button>
            <ShelfAction
              item={item}
              isSignedIn={isSignedIn}
              entryState={entryState}
              onSave={onSave}
            />
          </div>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.step}
            onClick={() => onStep(-1)}
            onKeyDown={onKeyDown}
            disabled={position <= 1}
            aria-label="Previous trailer"
          >
            <ChevronIcon back />
          </button>
          <button
            type="button"
            className={styles.step}
            onClick={() => onStep(1)}
            onKeyDown={onKeyDown}
            disabled={position >= total}
            aria-label="Next trailer"
          >
            <ChevronIcon />
          </button>
        </div>
      </div>
    </section>
  );
}
