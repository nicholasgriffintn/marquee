import { createAesGcmKeyring, type AesGcmKeyring } from "@ngriffin_uk/auth-crypto";

import type { Bindings } from "../types.ts";
import { logError } from "./logging.ts";

const ENVELOPE_PREFIX = "encv1";
const HKDF_SALT = "marquee.linked-accounts.oauth-tokens";
const HKDF_INFO = "linked_accounts.access_refresh_tokens";
const MAX_PLAINTEXT_BYTES = 4_096;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const additionalData = textEncoder.encode(HKDF_INFO);

let cachedKeyring: { secret: string; keyring: AesGcmKeyring } | null = null;

function keyringFor(secret: string) {
  if (cachedKeyring?.secret !== secret) {
    cachedKeyring = {
      secret,
      keyring: createAesGcmKeyring({
        secret,
        salt: HKDF_SALT,
        info: HKDF_INFO,
        maxPlaintextBytes: MAX_PLAINTEXT_BYTES,
      }),
    };
  }

  return cachedKeyring.keyring;
}

function parseEnvelope(value: string) {
  const parts = value.split(":");

  return parts.length === 3 && parts[0] === ENVELOPE_PREFIX
    ? { iv: parts[1], ciphertext: parts[2] }
    : null;
}

export class TokenEncryptionUnavailable extends Error {
  constructor() {
    super("TOKEN_ENCRYPTION_KEY is not configured, so no token can be stored");
    this.name = "TokenEncryptionUnavailable";
  }
}

export async function encryptOAuthToken(env: Bindings, plaintext: string): Promise<string> {
  if (!env.TOKEN_ENCRYPTION_KEY) {
    logError("token_encryption_key_missing", new TokenEncryptionUnavailable());

    throw new TokenEncryptionUnavailable();
  }

  const { iv, ciphertext } = await keyringFor(env.TOKEN_ENCRYPTION_KEY).encrypt(
    textEncoder.encode(plaintext),
    additionalData,
  );

  return `${ENVELOPE_PREFIX}:${iv}:${ciphertext}`;
}

export async function decryptOAuthToken(env: Bindings, stored: string): Promise<string> {
  const envelope = parseEnvelope(stored);

  if (!envelope) {
    return stored;
  }

  if (!env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured but a stored token is encrypted");
  }

  const plaintext = await keyringFor(env.TOKEN_ENCRYPTION_KEY).decrypt(envelope, additionalData);

  return textDecoder.decode(plaintext);
}
