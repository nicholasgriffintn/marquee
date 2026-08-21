import { useCallback, useRef, useState } from "react";

import type { MediaTitle } from "../domain/catalog";

type CuratorEvent =
  | { type: "status"; label: string }
  | { type: "result"; titleIds: string[]; items: MediaTitle[] }
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
};

const EMPTY: CuratorState = {
  prompt: "",
  status: "",
  summary: "",
  items: [],
  reasons: {},
  isStreaming: false,
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
  }, []);

  const ask = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();

    if (!trimmed) {
      return;
    }

    abortRef.current?.abort();

    const controller = new AbortController();

    abortRef.current = controller;
    setError("");
    setIsAsking(true);
    setState({ ...EMPTY, prompt: trimmed, status: "Thinking", isStreaming: true });

    try {
      const response = await fetch("/api/curator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("The AI curator is unavailable");
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";

      for (;;) {
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

          setState((current) => applyEvent(current, event));

          if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : "The AI curator is unavailable");
        setState((current) => ({ ...current, isStreaming: false, status: "" }));
      }
    } finally {
      setIsAsking(false);
    }
  }, []);

  return { state, error, clear, isAsking, ask };
}

function applyEvent(current: CuratorState, event: CuratorEvent): CuratorState {
  if (event.type === "status") {
    return { ...current, status: event.label };
  }

  if (event.type === "result") {
    return { ...current, items: event.items, status: "" };
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
