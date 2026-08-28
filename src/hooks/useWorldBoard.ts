import { useResource } from "./useResource";

export type WorldBoardLanguage = {
  language: string;
  article: string;
  articleUrl: string;
  views: number;
  previousViews: number;
  share: number;
};

type WorldBoardResponse = {
  languages: WorldBoardLanguage[];
  measuredAt: string | null;
};

export function useWorldBoard(titleId: string) {
  const { data, isLoading } = useResource<WorldBoardResponse>(
    `/api/catalog/titles/${encodeURIComponent(titleId)}/world-board`,
  );

  return {
    languages: data?.languages ?? [],
    measuredAt: data?.measuredAt ?? null,
    isLoading,
  };
}

export type WorldBoardEntry = {
  titleId: string;
  title: string;
  year: number | null;
  languages: WorldBoardLanguage[];
};

export function useWorldLeaders() {
  const { data, error, isLoading } = useResource<{ boards: WorldBoardEntry[] }>(
    "/api/catalog/world-board",
  );

  return { boards: data?.boards ?? [], error, isLoading };
}
