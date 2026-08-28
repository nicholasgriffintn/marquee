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
