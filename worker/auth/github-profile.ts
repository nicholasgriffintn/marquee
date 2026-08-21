import { AuthError, type ExternalIdentity } from "@ngriffin_uk/auth-core";
import type { OAuthTokenSet } from "@ngriffin_uk/auth-oauth2";
import { readResponseText, requestWithTimeout } from "@ngriffin_uk/auth-request";

import { boundedString, isRecord } from "../lib/values.ts";

export async function resolveGitHubIdentity(tokens: OAuthTokenSet): Promise<ExternalIdentity> {
  const response = await requestWithTimeout(
    fetch,
    "https://api.github.com/user",
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${tokens.accessToken}`,
        "user-agent": "marquee",
      },
      redirect: "manual",
    },
    8_000,
  );

  if (!response.ok) {
    throw new AuthError("provider_error");
  }

  const profile: unknown = JSON.parse(await readResponseText(response, 64 * 1_024));

  if (!isRecord(profile)) {
    throw new AuthError("provider_error");
  }

  const subject = githubIdentifier(profile.id);
  const login = boundedString(profile.login, 256);

  if (!login) {
    throw new AuthError("provider_error");
  }

  return {
    provider: "github",
    providerSubject: subject,
    claims: {
      id: subject,
      login,
      name: boundedString(profile.name),
      avatar_url: boundedString(profile.avatar_url),
    },
  };
}

function githubIdentifier(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }

  const identifier = boundedString(value, 256);

  if (!identifier) {
    throw new AuthError("provider_error");
  }

  return identifier;
}
