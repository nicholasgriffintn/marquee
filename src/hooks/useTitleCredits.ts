import { useResource } from "./useResource";

export type TitleCredit = {
  personId: number;
  name: string;
  profilePath: string | null;
  department: string;
  job: string | null;
  character: string | null;
  billing: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeCount: number | null;
};

export type CreditSeason = { season: number; credits: number; episodes: number };

type CreditsResponse = {
  cast: TitleCredit[];
  crew: TitleCredit[];
  seasons: CreditSeason[];
  total: number;
  page: number;
  hasMore: boolean;
};

const EMPTY: CreditsResponse = {
  cast: [],
  crew: [],
  seasons: [],
  total: 0,
  page: 1,
  hasMore: false,
};

export function useTitleCredits(titleId: string | null, season: number | null, page: number) {
  const query = new URLSearchParams({ page: String(page) });

  if (season !== null) {
    query.set("season", String(season));
  }

  const { data, isLoading } = useResource<CreditsResponse>(
    titleId ? `/api/catalog/titles/${encodeURIComponent(titleId)}/credits?${query}` : null,
  );

  return { credits: data ?? EMPTY, isLoading };
}
