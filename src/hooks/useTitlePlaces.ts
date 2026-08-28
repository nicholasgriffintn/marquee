import type { TitlePlaces } from "../domain/places";
import { useResource } from "./useResource";

const NOTHING: TitlePlaces = { filming: [], narrative: [] };

export function useTitlePlaces(titleId: string) {
  const { data } = useResource<TitlePlaces>(
    `/api/catalog/titles/${encodeURIComponent(titleId)}/places`,
  );

  return data ?? NOTHING;
}
