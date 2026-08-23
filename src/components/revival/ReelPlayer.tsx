import { useCallback, useEffect, useRef, useState } from "react";

import { clockLabel, type RevivalWork } from "../../domain/revival";
import { useProgressReporter } from "../../hooks/useRevival";
import { track } from "../../lib/telemetry";

const FINISHED_RATIO = 0.97;
const RESUME_FLOOR_SECONDS = 5;
const RESUME_TAIL_SECONDS = 10;

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
  const [isPlaying, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const report = useProgressReporter(work.id, canSave);

  useEffect(() => {
    const video = videoRef.current;
    const resumeAt = resumeRef.current;

    if (!video || resumeAt < RESUME_FLOOR_SECONDS) {
      return;
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

      return;
    }

    video.addEventListener("loadedmetadata", seek);

    return () => video.removeEventListener("loadedmetadata", seek);
  }, []);

  const onPlay = useCallback(() => {
    setPlaying((playing) => {
      if (!playing) {
        track("reel_play", { detail: work.id });
      }

      return true;
    });
  }, [work.id]);

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

  return (
    <div className="revival-player">
      <div className="revival-player-frame">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          src={work.reelUrl}
          poster={work.stillUrl ?? undefined}
          onPlay={onPlay}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onPause={onPause}
          onError={() => setError("That print will not thread. Try the source record below.")}
        />
      </div>
      {startAt >= RESUME_FLOOR_SECONDS && !isPlaying && (
        <p className="revival-resume">You stopped at {clockLabel(startAt)}. Picking up there.</p>
      )}
      {error && (
        <p className="revival-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
