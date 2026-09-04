import { useCallback, useState } from "react";

import { readStoredFlag, writeStoredFlag } from "../lib/storage";

const GATE_KEY = "marquee_revival_gate";

export function useRevivalGate() {
  const [accepted, setAccepted] = useState(() => readStoredFlag(GATE_KEY));
  const accept = useCallback(() => {
    writeStoredFlag(GATE_KEY);
    setAccepted(true);
  }, []);

  return { accepted, accept };
}
