import type { MediaTitle } from "../domain/catalog";
import { useResource } from "./useResource";

export type PathStep = { title: MediaTitle; toStart: number; toEnd: number };

export type TitlePath = { steps: PathStep[]; arrived: boolean; hops: number };

const NO_STEPS: PathStep[] = [];

export function useTitlePath(fromId: string, toId: string, enabled: boolean) {
  const path =
    fromId && toId && fromId !== toId
      ? `/api/catalog/titles/${encodeURIComponent(fromId)}/path?to=${encodeURIComponent(toId)}`
      : null;
  const { data, error, isLoading } = useResource<TitlePath>(path, {
    enabled,
    errorMessage: "I cannot get from one to the other just now",
  });

  return {
    steps: data?.steps ?? NO_STEPS,
    arrived: data?.arrived ?? false,
    error,
    isLoading: isLoading && Boolean(path),
  };
}
