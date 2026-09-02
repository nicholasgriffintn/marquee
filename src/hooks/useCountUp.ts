import { useEffect, useRef, useState } from "react";

const DURATION_MS = 900;

export function useCountUp(value: number, isRunning: boolean) {
  const [shown, setShown] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (value <= 0) {
      return undefined;
    }

    if (
      !isRunning ||
      startedRef.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      startedRef.current = true;
      setShown(value);

      return undefined;
    }

    startedRef.current = true;

    let frame = 0;
    const begunAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - begunAt) / DURATION_MS, 1);

      setShown(Math.round(value * (1 - (1 - progress) ** 3)));

      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [isRunning, value]);

  return shown;
}
