export function logEvent(event: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...detail }));
}

export function logError(event: string, error: unknown, detail: Record<string, unknown> = {}) {
  console.error(
    JSON.stringify({
      event,
      ...detail,
      kind: error instanceof Error ? error.name : "UnknownError",
      detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }),
  );
}

const AI_ANGLES: ReadonlySet<string> = new Set([
  "acclaimed",
  "buzz",
  "cast",
  "close",
  "comfort",
  "widen",
]);

function boundedInteger(value: unknown, max: number) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max
    ? Number(value)
    : undefined;
}

export function logAiGeneration(
  event: "rail_retry" | "rail_final",
  detail: Record<string, unknown>,
) {
  const angle =
    typeof detail.angle === "string" && AI_ANGLES.has(detail.angle) ? detail.angle : null;
  const round = boundedInteger(detail.round, 3);
  const available = boundedInteger(detail.available, 1_000);

  logEvent(event, {
    ...(angle ? { angle } : {}),
    ...(round === undefined ? {} : { round }),
    ...(available === undefined ? {} : { available }),
    ...(typeof detail.ok === "boolean" ? { ok: detail.ok } : {}),
  });
}

export function logAiError(event: "curator_narration_failed", error: unknown) {
  console.error(
    JSON.stringify({
      event,
      kind: error instanceof Error ? error.name : "UnknownError",
    }),
  );
}
