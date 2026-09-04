import type { EditionIssue } from "../domain/edition";
import { useResource } from "./useResource";

export function useEdition(weekOf: string | undefined) {
  const { data, isLoading, error, status } = useResource<EditionIssue>(
    `/api/editions/${weekOf ?? "latest"}`,
    { errorMessage: "The programme is unavailable" },
  );

  return { issue: data, isLoading, error, status };
}
