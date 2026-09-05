import { AuthError } from "@ngriffin_uk/auth-core";

export function requiredAuthSecret(value: string | undefined) {
  const secret = value?.trim();

  if (!secret) {
    throw new AuthError("provider_not_found");
  }

  return secret;
}
