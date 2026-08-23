import { useCallback, useState, type MouseEvent } from "react";

import { track } from "../../lib/telemetry";
import { shouldWarnOnExit, type Exit } from "../usher/ExitDoor";

export function useExitWarning(titleId: string) {
  const [exit, setExit] = useState<Exit | null>(null);

  const report = useCallback(
    (next: Exit) => {
      if (next.kind !== "provider") {
        return;
      }

      track("provider_exit", {
        detail: next.label,
        titleId,
        ...(next.providerId ? { providerId: next.providerId } : {}),
        ...(next.monetization ? { monetization: next.monetization } : {}),
      });
    },
    [titleId],
  );

  const leaveVia = useCallback(
    (next: Exit) => (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldWarnOnExit()) {
        report(next);

        return;
      }

      event.preventDefault();
      setExit(next);
    },
    [report],
  );

  return { exit, leaveVia, report, dismiss: useCallback(() => setExit(null), []) };
}
