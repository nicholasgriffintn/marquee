import { parseCookies } from "@ngriffin_uk/auth-cookie";

import { bearerUser } from "../auth/api-tokens.ts";
import { GUEST_COOKIE, sessionPrincipal } from "../auth/session.ts";
import type { Bindings } from "../types.ts";

export type Identity = { member: boolean; key: string; userId: string | null };

const identities = new WeakMap<Request, Promise<Identity>>();

export function requestIdentity(env: Bindings, request: Request) {
  const cached = identities.get(request);

  if (cached) {
    return cached;
  }

  const pending = resolveIdentity(env, request);

  identities.set(request, pending);

  return pending;
}

async function resolveIdentity(env: Bindings, request: Request): Promise<Identity> {
  const principal = await sessionPrincipal(env, request);

  if (principal) {
    return { member: true, key: principal.user.id, userId: principal.user.id };
  }

  if (request.headers.get("authorization")) {
    const user = await bearerUser(env, request);

    if (user) {
      return { member: true, key: user.id, userId: user.id };
    }
  }

  return { member: false, key: anonymousKey(request), userId: null };
}

function anonymousKey(request: Request) {
  const address = request.headers.get("cf-connecting-ip")?.trim().slice(0, 64);

  if (address) {
    return address;
  }

  const guest = parseCookies(request.headers.get("cookie") ?? "").get(GUEST_COOKIE);

  return guest?.slice(0, 64) || "anonymous";
}
