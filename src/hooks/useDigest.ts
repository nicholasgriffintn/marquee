import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

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
  const { data, isLoading } = useResource<{ digest: Digest | null }>("/api/curator/digest", {
    enabled: isSignedIn,
  });

  return { digest: data?.digest ?? null, isLoading: isSignedIn && isLoading };
}
