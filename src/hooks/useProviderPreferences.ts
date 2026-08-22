import { useCallback, useState } from "react";

const STORAGE_KEY = "marquee.selectedProviderIds";

function readStored(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");

    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === "string" && Boolean(id)).slice(0, 40)
      : [];
  } catch {
    return [];
  }
}

export function useProviderPreferences() {
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>(readStored);

  const selectProviders = useCallback((nextIds: string[]) => {
    setSelectedProviderIds(nextIds);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextIds));
    } catch {
      return;
    }
  }, []);

  return { selectedProviderIds, selectProviders };
}
