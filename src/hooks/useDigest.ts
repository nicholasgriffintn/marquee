import { useEffect, useState } from "react";

import type { MediaTitle } from "../domain/catalog";
import { requestJson } from "../lib/api";

export type DigestNumbers = {
  added: number;
  finished: number;
  shelved: number;
  catalogue: number;
};

export type Digest = {
  createdAt: string;
  lead: { item: MediaTitle | null; line: string } | null;
  numbers: DigestNumbers;
  fresh: MediaTitle[];
  trending: MediaTitle[];
  episodes: {
    titleId: string | null;
    showName: string;
    season: number | null;
    episode: number | null;
    airsAt: string;
  }[];
};

export function useDigest(isSignedIn: boolean) {
  const [state, setState] = useState<{ digest: Digest | null; isLoading: boolean }>({
    digest: null,
    isLoading: true,
  });

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function load() {
      try {
        const response = await requestJson<{ digest: Digest | null }>("/api/curator/digest", {
          signal: controller.signal,
        });

        if (active) {
          setState({ digest: response.digest, isLoading: false });
        }
      } catch {
        if (active) {
          setState({ digest: null, isLoading: false });
        }
      }
    }

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isSignedIn]);

  return { digest: state.digest, isLoading: state.isLoading };
}
