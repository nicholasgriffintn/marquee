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
  const [digest, setDigest] = useState<Digest | null>(null);
  const [isLoading, setIsLoading] = useState(isSignedIn);

  useEffect(() => {
    if (!isSignedIn) {
      return;
    }

    const controller = new AbortController();

    requestJson<{ digest: Digest | null }>("/api/curator/digest", { signal: controller.signal })
      .then((response) => setDigest(response.digest))
      .catch(() => setDigest(null))
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [isSignedIn]);

  return { digest, isLoading };
}
