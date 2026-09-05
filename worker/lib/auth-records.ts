import { AuthError, isAuthChallengeKind, type AuthChallengeRecord } from "@ngriffin_uk/auth-core";
import type { OAuthStateRecord } from "@ngriffin_uk/auth-oauth2";

import { isRecord, parseJson } from "./values.ts";

export type ChallengeRow = {
  token_hash: string;
  provider: string;
  kind: string;
  payload: string;
  attempts: number;
  created_at: string;
  expires_at: string;
};

export function mapChallenge(row: ChallengeRow): AuthChallengeRecord {
  const payload = parseJson(row.payload);

  if (!isAuthChallengeKind(row.kind)) {
    throw new AuthError("invalid_input");
  }

  return {
    tokenHash: row.token_hash,
    provider: row.provider,
    kind: row.kind,
    payload: isRecord(payload) ? payload : {},
    attempts: row.attempts,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
  };
}

export type OAuthStateRow = {
  state_hash: string;
  provider: string;
  code_verifier: string | null;
  nonce: string | null;
  redirect_uri: string | null;
  context_json: string;
  created_at: string;
  expires_at: string;
};

export function mapOAuthState(row: OAuthStateRow): OAuthStateRecord {
  const context = parseJson(row.context_json);

  return {
    stateHash: row.state_hash,
    provider: row.provider,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    context: isRecord(context)
      ? Object.fromEntries(
          Object.entries(context).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {},
    ...(row.code_verifier ? { codeVerifier: row.code_verifier } : {}),
    ...(row.nonce ? { nonce: row.nonce } : {}),
    ...(row.redirect_uri ? { redirectUri: row.redirect_uri } : {}),
  };
}
