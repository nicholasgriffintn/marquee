import { useCallback, useRef, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { isAbortError } from "../lib/errors";
import { startJourney } from "../lib/journey";
import { jsonMutation, mutateJson, mutateResponse } from "../lib/query-client";

type CuratorEvent =
  | { type: "status"; label: string }
  | { type: "result"; titleIds: string[]; decisionId?: string; items: MediaTitle[] }
  | { type: "delta"; text: string }
  | { type: "done"; summary: string; reasons: Record<string, string> }
  | { type: "error"; message: string };

export type CuratorState = {
  prompt: string;
  status: string;
  summary: string;
  items: MediaTitle[];
  reasons: Record<string, string>;
  isStreaming: boolean;
  decisionId: string;
};

const EMPTY: CuratorState = {
  prompt: "",
  status: "",
  summary: "",
  items: [],
  reasons: {},
  isStreaming: false,
  decisionId: "",
};

export function useCurator() {
  const [state, setState] = useState<CuratorState>(EMPTY);
  const [error, setError] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(EMPTY);
    setError("");
    setIsAsking(false);
    void mutateJson("/api/curator", jsonMutation("DELETE")).catch(() => undefined);
  }, []);

  const ask = useCallback(
    async (prompt: string, isRefinement = false, providerIds: string[] = []) => {
      const trimmed = prompt.trim();

      if (!trimmed) {
        return;
      }

      abortRef.current?.abort();

      const controller = new AbortController();

      abortRef.current = controller;
      setError("");
      setIsAsking(true);
      setState((current) => ({
        ...EMPTY,
        prompt: trimmed,
        items: isRefinement ? current.items : [],
        status: "Thinking",
        isStreaming: true,
      }));

      try {
        const response = await mutateResponse("/api/curator", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt: trimmed,
            providerIds,
            hour: new Date().getHours(),
            isWeekend: [0, 6].includes(new Date().getDay()),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(await failureMessage(response));
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";

        for (;;) {
          // oxlint-disable-next-line no-await-in-loop -- reads one stream reader sequentially, chunks arrive in order
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += value;

          const chunks = buffer.split("\n\n");

          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const line = chunk.split("\n").find((part) => part.startsWith("data:"));

            if (!line) {
              continue;
            }

            const event = JSON.parse(line.slice(5).trim()) as CuratorEvent;

            if (event.type === "result") {
              openCuratorJourneys(event.items, event.decisionId);
            }

            setState((current) => applyEvent(current, event));

            if (event.type === "error") {
              setError(event.message);
            }
          }
        }
      } catch (caught) {
        if (!isAbortError(caught)) {
          setError(caught instanceof Error ? caught.message : "The AI curator is unavailable");
          setState((current) => ({
            ...current,
            isStreaming: false,
            status: "",
          }));
        }
      } finally {
        setIsAsking(false);
      }
    },
    [],
  );

  return { state, error, clear, isAsking, ask };
}

function openCuratorJourneys(items: MediaTitle[], decisionId: string | undefined) {
  items.forEach((item, index) => {
    startJourney(item.id, {
      source: "curator",
      position: index,
      ...(decisionId ? { decisionId } : {}),
    });
  });
}

async function failureMessage(response: Response) {
  const fallback = "The AI curator is unavailable";

  try {
    const payload: unknown = await response.json();

    if (payload && typeof payload === "object" && "error" in payload) {
      return typeof payload.error === "string" && payload.error ? payload.error : fallback;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function applyEvent(current: CuratorState, event: CuratorEvent): CuratorState {
  if (event.type === "status") {
    return { ...current, status: event.label };
  }

  if (event.type === "result") {
    return {
      ...current,
      items: event.items,
      decisionId: event.decisionId ?? "",
      status: "",
    };
  }

  if (event.type === "delta") {
    return { ...current, summary: current.summary + event.text, status: "" };
  }

  if (event.type === "done") {
    return {
      ...current,
      summary: event.summary,
      reasons: event.reasons,
      isStreaming: false,
      status: "",
    };
  }

  return { ...current, isStreaming: false, status: "" };
}
