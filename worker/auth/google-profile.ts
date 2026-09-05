import { AuthError, type ExternalIdentity } from "@ngriffin_uk/auth-core";
import type { OAuthTokenSet } from "@ngriffin_uk/auth-oauth2";
import { readResponseText, requestWithTimeout } from "@ngriffin_uk/auth-request";

import { httpsUrl } from "../lib/urls.ts";
import { boundedString, isRecord, parseJson } from "../lib/values.ts";

export async function resolveGoogleIdentity(tokens: OAuthTokenSet): Promise<ExternalIdentity> {
  const response = await requestWithTimeout(
    fetch,
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${tokens.accessToken}`,
      },
      redirect: "manual",
    },
    8_000,
  );

  if (!response.ok) {
    throw new AuthError("provider_error");
  }

  const profile = parseJson(await readResponseText(response, 64 * 1_024));
  const subject = isRecord(profile) ? boundedString(profile.sub, 255) : null;

  if (!isRecord(profile) || !subject) {
    throw new AuthError("provider_error");
  }

  return {
    provider: "google",
    providerSubject: subject,
    claims: {
      name: boundedString(profile.name),
      avatar_url: httpsUrl(boundedString(profile.picture)),
    },
  };
}
