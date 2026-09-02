import { createContext, useCallback, useContext, type ReactNode } from "react";

import type { ScreeningRoom } from "../../hooks/useScreening";

const ScreeningContext = createContext<ScreeningRoom | null>(null);

export function ScreeningProvider({
  value,
  children,
}: {
  value: ScreeningRoom | null;
  children: ReactNode;
}) {
  return <ScreeningContext.Provider value={value}>{children}</ScreeningContext.Provider>;
}

export function useScreeningRoom() {
  return useContext(ScreeningContext);
}

export function useStageReport(stage: string) {
  const screening = useScreeningRoom();
  const report = screening?.isMember ? screening.actions.report : null;

  return useCallback(
    (verb: string, detail: string) => {
      report?.(stage, verb, detail);
    },
    [report, stage],
  );
}
