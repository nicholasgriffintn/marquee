import { useEffect, useRef, useState } from "react";

import { clockLabel, type RevivalWork } from "../../domain/revival";
import { useProgressReporter } from "../../hooks/useRevival";
import { track } from "../../lib/telemetry";

const FINISHED_RATIO = 0.97;
const RESUME_FLOOR_SECONDS = 5;

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
  const [isPlaying, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const report = useProgressReporter(work.id, canSave);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || startAt < RESUME_FLOOR_SECONDS) {
      return;
    }

    const seek = () => {
      if (video.duration && startAt < video.duration - 10) {
        video.currentTime = startAt;
      }
    };

    video.addEventListener("loadedmetadata", seek, { once: true });

    return () => video.removeEventListener("loadedmetadata", seek);
  }, [startAt]);

  return (
    <div className="revival-player">
      <div className="revival-player-frame">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          poster={work.stillUrl ?? undefined}
          onPlay={() => {
            if (!isPlaying) {
              track("reel_play", { detail: work.id });
              setPlaying(true);
            }
          }}
          onTimeUpdate={(event) => report(event.currentTarget.currentTime, false)}
          onEnded={(event) => report(event.currentTarget.duration, true)}
          onPause={(event) => {
            const video = event.currentTarget;

            report(
              video.currentTime,
              video.duration > 0 && video.currentTime / video.duration > FINISHED_RATIO,
            );
          }}
          onError={() => setError("That print will not thread. Try the source record below.")}
        >
          <source src={work.reelUrl} type="video/mp4" />
        </video>
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
