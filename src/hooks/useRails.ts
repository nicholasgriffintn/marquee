import { useEffect, useMemo, useRef, useState } from "react";

import {
  curatedFrom,
  NO_RAILS,
  personalFrom,
  type DeliveredRail,
  type RailsDelivery,
} from "../domain/rails";
import { queryJson } from "../lib/query-client";

const RETRY_DELAYS = [10_000, 30_000];
const SHELF_CHANGE_DEBOUNCE_MS = 4_000;

type Settled = { viewerId: string; done: boolean; curated: DeliveredRail[] };
type DeliveryState = { viewerId: string; value: RailsDelivery };

const NOT_SETTLED: Settled = { viewerId: "", done: false, curated: [] };
const NO_DELIVERY: DeliveryState = { viewerId: "", value: NO_RAILS };

export function useRails(viewerId: string, enabled: boolean, savedKey: string) {
  const [deliveryState, setDeliveryState] = useState(NO_DELIVERY);
  const [settled, setSettled] = useState(NOT_SETTLED);
  const loadedViewer = useRef("");
  const delivery = deliveryState.viewerId === viewerId ? deliveryState.value : NO_RAILS;
  const viewerSettled = settled.viewerId === viewerId ? settled : NOT_SETTLED;

  useEffect(() => {
    if (!enabled || !viewerId) {
      return undefined;
    }

    let active = true;
    let timer = 0;
    const kickoffDelay = loadedViewer.current === viewerId ? SHELF_CHANGE_DEBOUNCE_MS : 0;

    loadedViewer.current = viewerId;

    async function load(attempt: number) {
      try {
        const query = new URLSearchParams({ generate: "1", clientRevision: savedKey });
        const next = await queryJson<RailsDelivery>(
          `/api/catalog/rails?${query}`,
          `${viewerId}:${savedKey}:${attempt}`,
        );

        if (!active) {
          return;
        }

        setDeliveryState({ viewerId, value: next });
        setSettled((current) =>
          current.viewerId === viewerId && current.done
            ? current
            : { viewerId, done: true, curated: curatedFrom(next) },
        );

        const delay = RETRY_DELAYS[attempt];

        if (next.status === "generating" && delay !== undefined) {
          timer = window.setTimeout(() => void load(attempt + 1), delay);
        }
      } catch {
        if (active) {
          setDeliveryState((current) => ({
            viewerId,
            value: {
              ...(current.viewerId === viewerId ? current.value : NO_RAILS),
              status: "error",
            },
          }));
          setSettled((current) =>
            current.viewerId === viewerId && current.done
              ? current
              : { viewerId, done: true, curated: [] },
          );
        }
      }
    }

    const kickoff = window.setTimeout(() => void load(0), kickoffDelay);

    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearTimeout(timer);
    };
  }, [enabled, savedKey, viewerId]);

  const curated = useMemo(() => curatedFrom(delivery), [delivery]);
  const personal = useMemo(() => personalFrom(delivery), [delivery]);

  return {
    curated: viewerId ? curated : [],
    personal: viewerId ? personal : [],
    heroCurated: viewerId ? viewerSettled.curated : [],
    isGenerating: Boolean(viewerId) && delivery.status === "generating",
  };
}
