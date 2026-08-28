import { NO_AWARDS, type AwardSummary } from "../domain/awards";
import { useResource } from "./useResource";

export function useTitleAwards(titleId: string | null) {
  const { data, isLoading } = useResource<AwardSummary>(
    titleId ? `/api/catalog/titles/${encodeURIComponent(titleId)}/awards` : null,
  );

  return { awards: data ?? NO_AWARDS, isLoading };
}
