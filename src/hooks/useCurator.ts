import { useState } from "react";

import { ApiError, jsonRequest, requestJson } from "../lib/api";
import type { CuratorResponse } from "../types";

export function useCurator() {
  const [curator, setCurator] = useState<CuratorResponse | null>(null);
  const [error, setError] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  async function ask(prompt: string) {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || isAsking) {
      return;
    }

    setIsAsking(true);
    setError("");
    try {
      setCurator(
        await requestJson<CuratorResponse>(
          "/api/curator",
          jsonRequest("POST", { prompt: trimmedPrompt }),
        ),
      );
    } catch (caught) {
      setCurator(null);
      setError(
        caught instanceof ApiError ? caught.message : "Cloudflare AI curator is unavailable",
      );
    } finally {
      setIsAsking(false);
    }
  }

  function clear() {
    setCurator(null);
    setError("");
  }

  return { curator, error, clear, isAsking, ask };
}
