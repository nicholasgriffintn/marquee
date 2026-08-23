import { useCallback, useEffect, useRef, useState } from "react";

import { clockLabel, runtimeLabel, type RevivalWork } from "../../domain/revival";
import { useProgressReporter } from "../../hooks/useRevival";
import { track } from "../../lib/telemetry";
import { ArtPlaceholder } from "../ArtPlaceholder";

const FINISHED_RATIO = 0.97;
const RESUME_FLOOR_SECONDS = 5;
const RESUME_TAIL_SECONDS = 10;
const CURTAIN_MS = 460;

export function ReelPlayer({
  work,
  startAt,
  canSave,
}: {
  work: RevivalWork;
  startAt: number;
  canSave: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeRef = useRef(startAt);
  const resumedRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [raising, setRaising] = useState(false);
  const raisingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [stillFailed, setStillFailed] = useState(false);
  const [error, setError] = useState("");
  const report = useProgressReporter(work.id, canSave);

  useEffect(() => {
    const video = videoRef.current;
    const resumeAt = resumeRef.current;

    if (!video || resumeAt < RESUME_FLOOR_SECONDS) {
      return undefined;
    }

    const seek = () => {
      if (resumedRef.current) {
        return;
      }

      resumedRef.current = true;

      if (video.duration && resumeAt < video.duration - RESUME_TAIL_SECONDS) {
        video.currentTime = resumeAt;
      }
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seek();

      return undefined;
    }

    video.addEventListener("loadedmetadata", seek);

    return () => video.removeEventListener("loadedmetadata", seek);
  }, []);

  const raise = useCallback(() => {
    const video = videoRef.current;

    if (raisingRef.current) {
      return;
    }

    raisingRef.current = true;
    setRaising(true);
    track("reel_play", { detail: work.id });

    if (video) {
      void video.play().catch(() => undefined);
    }
  }, [work.id]);

  useEffect(() => {
    if (!raising) {
      return undefined;
    }

    const timer = window.setTimeout(() => setStarted(true), CURTAIN_MS);

    return () => window.clearTimeout(timer);
  }, [raising]);

  const onTimeUpdate = useCallback(
    (event: { currentTarget: HTMLVideoElement }) => report(event.currentTarget.currentTime, false),
    [report],
  );

  const onEnded = useCallback(
    (event: { currentTarget: HTMLVideoElement }) => report(event.currentTarget.duration, true),
    [report],
  );

  const onPause = useCallback(
    (event: { currentTarget: HTMLVideoElement }) => {
      const video = event.currentTarget;

      report(
        video.currentTime,
        video.duration > 0 && video.currentTime / video.duration > FINISHED_RATIO,
      );
    },
    [report],
  );

  const still = stillFailed ? null : work.stillUrl;
  const resuming = startAt >= RESUME_FLOOR_SECONDS;

  return (
    <div className="revival-player">
      <div className={`revival-player-frame${started ? " is-running" : ""}`}>
        <video
          ref={videoRef}
          controls={started}
          playsInline
          preload="metadata"
          src={work.reelUrl}
          poster={still ?? undefined}
          onCanPlay={() => setReady(true)}
          onPlaying={raise}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onPause={onPause}
          onError={() => setError("That print will not thread. Try the source record below.")}
        />
        {!started && (
          <button
            type="button"
            className={`revival-curtain${raising ? " raising" : ""}`}
            aria-hidden={raising}
            tabIndex={raising ? -1 : undefined}
            onClick={raise}
          >
            {still ? (
              <img src={still} alt="" loading="eager" onError={() => setStillFailed(true)} />
            ) : (
              <ArtPlaceholder seed={work.id} label={work.title} wide />
            )}
            <span className="revival-curtain-face">
              <span className="revival-curtain-play" aria-hidden="true">
                ▶
              </span>
              <span className="revival-curtain-copy">
                <strong>{resuming ? "Back to your seat" : "Start the projector"}</strong>
                <small>
                  {resuming
                    ? `You left it at ${clockLabel(startAt)}`
                    : (runtimeLabel(work.runtimeSeconds) ?? work.title)}
                  {ready ? "" : " · threading"}
                </small>
              </span>
            </span>
          </button>
        )}
      </div>
      {error && (
        <p className="revival-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
