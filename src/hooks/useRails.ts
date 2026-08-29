import { useEffect, useMemo, useRef, useState } from "react";

import {
  curatedFrom,
  NO_RAILS,
  personalFrom,
  type DeliveredRail,
  type RailsDelivery,
} from "../domain/rails";
import { queryJson } from "../lib/query-client";

const RETRY_DELAYS = [5_000, 10_000, 20_000, 30_000];
const SHELF_CHANGE_DEBOUNCE_MS = 4_000;

type Settled = { done: boolean; curated: DeliveredRail[] };

const NOT_SETTLED: Settled = { done: false, curated: [] };

export function useRails(isSignedIn: boolean, savedKey: string) {
  const [delivery, setDelivery] = useState(NO_RAILS);
  const [settled, setSettled] = useState(NOT_SETTLED);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    if (!isSignedIn) {
      return undefined;
    }

    let active = true;
    let timer = 0;
    const kickoffDelay = hasLoadedOnce.current ? SHELF_CHANGE_DEBOUNCE_MS : 0;

    hasLoadedOnce.current = true;

    async function load(attempt: number) {
      try {
        const next = await queryJson<RailsDelivery>(
          "/api/catalog/rails?generate=1",
          `${savedKey}:${attempt}`,
        );

        if (!active) {
          return;
        }

        setDelivery(next);
        setSettled((current) =>
          current.done ? current : { done: true, curated: curatedFrom(next) },
        );

        const delay = RETRY_DELAYS[attempt];

        if (next.status === "generating" && delay !== undefined) {
          timer = window.setTimeout(() => void load(attempt + 1), delay);
        }
      } catch {
        if (active) {
          setDelivery((current) => ({ ...current, status: "error" }));
          setSettled((current) => (current.done ? current : { done: true, curated: [] }));
        }
      }
    }

    const kickoff = window.setTimeout(() => void load(0), kickoffDelay);

    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearTimeout(timer);
    };
  }, [isSignedIn, savedKey]);

  const curated = useMemo(() => curatedFrom(delivery), [delivery]);
  const personal = useMemo(() => personalFrom(delivery), [delivery]);

  return {
    curated,
    personal,
    heroCurated: settled.curated,
    isGenerating: delivery.status === "generating",
    isResolved: !isSignedIn || settled.done,
  };
}
