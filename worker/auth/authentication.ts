import { AuthError } from "@ngriffin_uk/auth-core";
import { magicLinkAuth } from "@ngriffin_uk/auth-magic-link";
import type { AuthFlowResult } from "@ngriffin_uk/auth-protocol";
import { createGitHubAuth } from "@ngriffin_uk/auth-provider-github";

import { sendSignInEmail } from "../clients/email.ts";
import type { Bindings } from "../types.ts";
import { createD1Auth, createD1OAuthStateStore, findOrCreateByEmail } from "./d1-adapter.ts";
import { resolveGitHubIdentity } from "./github-profile.ts";
import type { MarqueeUser } from "./model.ts";

export interface Authentication {
  currentUser(rawSession: string): Promise<MarqueeUser | null>;
  logout(rawSession: string): Promise<void>;
  startGitHub(): Promise<URL>;
  completeGitHub(code: string, state: string): Promise<AuthFlowResult<MarqueeUser>>;
  requestMagicLink(email: string, destination?: MagicLinkDestination): Promise<void>;
  completeMagicLink(token: string): Promise<AuthFlowResult<MarqueeUser>>;
}

export type MagicLinkDestination = { kind: "web" } | { kind: "native"; challenge: string };

export function createAuthentication(
  db: D1Database,
  env: Bindings,
  origin: string,
): Authentication {
  const auth = createD1Auth(db);
  const github = () =>
    auth.use(
      createGitHubAuth<MarqueeUser>({
        clientId: requiredSecret(env.GITHUB_CLIENT_ID),
        clientSecret: requiredSecret(env.GITHUB_CLIENT_SECRET),
        redirectUri: `${origin}/api/auth/callback/github`,
        scopes: ["read:user"],
        stateStore: createD1OAuthStateStore(db),
        resolveIdentity: resolveGitHubIdentity,
      }),
    ).providers.github;

  const magicLink = (destination: MagicLinkDestination = { kind: "web" }) =>
    auth.use(
      magicLinkAuth<MarqueeUser>({
        mode: "link",
        resolveUser: (email) => findOrCreateByEmail(db, email),
        send: async ({ email, token, expiresAt }) => {
          await sendSignInEmail(env, email, magicLinkUrl(origin, destination, token), expiresAt);
        },
      }),
    ).providers["magic-link"];

  return {
    currentUser: (rawSession) => auth.validateSession(rawSession),
    logout: (rawSession) => auth.revokeSession(rawSession),
    startGitHub: () => github().startAuthorization(),
    completeGitHub: (code, state) => github().completeAuthorization({ code, state }),
    requestMagicLink: async (email, destination = { kind: "web" }) => {
      await magicLink(destination).request(email);
    },
    completeMagicLink: (token) => magicLink().authenticate({ token }),
  };
}

function magicLinkUrl(origin: string, destination: MagicLinkDestination, token: string) {
  const url = new URL(
    destination.kind === "native" ? "/api/auth/native/magic" : "/api/auth/magic",
    origin,
  );

  url.searchParams.set("token", token);
  if (destination.kind === "native") {
    url.searchParams.set("challenge", destination.challenge);
  }

  return url.href;
}

function requiredSecret(value: string | undefined) {
  const secret = value?.trim();

  if (!secret) {
    throw new AuthError("provider_not_found");
  }

  return secret;
}
