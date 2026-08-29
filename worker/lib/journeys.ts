import { constantTimeEqual, hmac, sha256 } from "@ngriffin_uk/auth-crypto";
import { decodeBase64Url, encodeBase64Url } from "@ngriffin_uk/auth-encoding";

import type { CatalogSection } from "../../src/domain/catalog.ts";
import {
  isJourneyMode,
  JOURNEY_ANGLE_LIMIT,
  JOURNEY_SIZE_LIMIT,
  JOURNEY_TTL_MS,
  type JourneyMode,
} from "../../src/domain/journeys.ts";
import type { Bindings } from "../types.ts";
import { logEvent } from "./logging.ts";
import { clamp } from "./numbers.ts";
import { randomHex } from "./tokens.ts";
import { isRecord } from "./values.ts";

export type JourneyGrant = { mode: JourneyMode; angle: string; size: number };

export type Journey = JourneyGrant & { id: string; issuedAt: number };

export type MintedJourney = { id: string; token: string };

type Payload = { i: string; m: string; a: string; s: number; t: number };

const VERSION = "j1";
const KEY_INFO = "marquee.journeys.hmac";
const TOKEN_LIMIT = 512;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let ephemeralSecret = "";
let cachedKey: { secret: string; bytes: Uint8Array } | null = null;

// Without a configured secret (local dev, preview) journeys are still signed,
// but with a key that dies with the isolate: tokens minted before a restart
// stop verifying rather than being trusted unsigned.
function secretFor(env: Bindings) {
  if (env.TOKEN_ENCRYPTION_KEY) {
    return env.TOKEN_ENCRYPTION_KEY;
  }

  if (!ephemeralSecret) {
    ephemeralSecret = randomHex(32);
    logEvent("journey_signing_key_ephemeral");
  }

  return ephemeralSecret;
}

async function signingKey(env: Bindings) {
  const secret = secretFor(env);

  if (cachedKey?.secret !== secret) {
    cachedKey = { secret, bytes: await sha256(encoder.encode(`${KEY_INFO}:${secret}`)) };
  }

  return cachedKey.bytes;
}

function sign(env: Bindings, payload: string) {
  return signingKey(env).then((key) =>
    hmac("SHA-256", key, encoder.encode(`${VERSION}.${payload}`)),
  );
}

function readPayload(value: string): Payload | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(decoder.decode(decodeBase64Url(value)));
  } catch {
    return null;
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.i !== "string" ||
    typeof parsed.m !== "string" ||
    typeof parsed.a !== "string" ||
    typeof parsed.s !== "number" ||
    typeof parsed.t !== "number"
  ) {
    return null;
  }

  return { i: parsed.i, m: parsed.m, a: parsed.a, s: parsed.s, t: parsed.t };
}

export async function mintJourney(env: Bindings, grant: JourneyGrant): Promise<MintedJourney> {
  const id = randomHex(8);
  const payload: Payload = {
    i: id,
    m: grant.mode,
    a: grant.angle.slice(0, JOURNEY_ANGLE_LIMIT),
    s: clamp(Math.trunc(grant.size) || 0, 0, JOURNEY_SIZE_LIMIT),
    t: Date.now(),
  };
  const encoded = encodeBase64Url(encoder.encode(JSON.stringify(payload)), false);
  const signature = encodeBase64Url(await sign(env, encoded), false);

  return { id, token: `${VERSION}.${encoded}.${signature}` };
}

export async function verifyJourney(env: Bindings, token: unknown): Promise<Journey | null> {
  if (typeof token !== "string" || token.length > TOKEN_LIMIT) {
    return null;
  }

  const [version, encoded, signature] = token.split(".");

  if (version !== VERSION || !encoded || !signature) {
    return null;
  }

  let matches = false;

  try {
    matches = constantTimeEqual(await sign(env, encoded), decodeBase64Url(signature));
  } catch {
    return null;
  }

  const payload = matches ? readPayload(encoded) : null;

  if (!payload || !isJourneyMode(payload.m) || Date.now() - payload.t >= JOURNEY_TTL_MS) {
    return null;
  }

  return { id: payload.i, mode: payload.m, angle: payload.a, size: payload.s, issuedAt: payload.t };
}

// How long the viewer sat with the served set before acting on it. Read from the
// signed mint time so it cannot be dictated by the client.
export function journeyLatency(journey: Journey) {
  return clamp(Date.now() - journey.issuedAt, 0, JOURNEY_TTL_MS);
}

export function journeyRank(value: unknown, journey: Journey) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 && parsed < journey.size ? parsed : undefined;
}

export function ticketSections(env: Bindings, sections: CatalogSection[], mode: JourneyMode) {
  return Promise.all(
    sections.map(async (section) => ({
      ...section,
      journey: (
        await mintJourney(env, {
          mode,
          angle: section.angle ?? section.id,
          size: section.items.length,
        })
      ).token,
    })),
  );
}
