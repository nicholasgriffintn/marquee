import { useCallback, useState } from "react";

import type { EvaluationReport } from "../domain/evaluation";
import { jsonMutation, mutateJson } from "../lib/query-client";

export function useEvaluation() {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    setIsRunning(true);
    setError("");

    try {
      setReport(
        await mutateJson<EvaluationReport>("/api/admin/quality/evaluate", jsonMutation("POST")),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The fixture run did not finish.");
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { report, isRunning, error, run };
}
