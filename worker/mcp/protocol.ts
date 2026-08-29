export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

export type ProtocolVersion = (typeof PROTOCOL_VERSIONS)[number];

export const LATEST_PROTOCOL_VERSION: ProtocolVersion = "2025-11-25";

const ASSUMED_PROTOCOL_VERSION: ProtocolVersion = "2025-03-26";

const STRUCTURED_OUTPUT_FROM = "2025-06-18";

export const SERVER_INFO = {
  name: "marquee",
  version: "2.0.0",
  description: "Marquee's film and television catalogue, shelf and diary.",
};

const KNOWN: ReadonlySet<string> = new Set(PROTOCOL_VERSIONS);

function isProtocolVersion(value: unknown): value is ProtocolVersion {
  return typeof value === "string" && KNOWN.has(value);
}

export function negotiateProtocol(requested: unknown): ProtocolVersion {
  return isProtocolVersion(requested) ? requested : LATEST_PROTOCOL_VERSION;
}

export function requestProtocol(request: Request): ProtocolVersion {
  const header = request.headers.get("mcp-protocol-version");

  return isProtocolVersion(header) ? header : ASSUMED_PROTOCOL_VERSION;
}

export function understandsStructuredOutput(version: ProtocolVersion) {
  return version >= STRUCTURED_OUTPUT_FROM;
}

export function ok(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

export function fail(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
