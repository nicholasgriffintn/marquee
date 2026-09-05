import { magicLinkAuth } from "@ngriffin_uk/auth-magic-link";
import type { AuthFlowResult } from "@ngriffin_uk/auth-protocol";
import { createGitHubAuth } from "@ngriffin_uk/auth-provider-github";
import { createGoogleAuth } from "@ngriffin_uk/auth-provider-google";

import { sendSignInEmail } from "../clients/email.ts";
import { requiredAuthSecret } from "../lib/auth-config.ts";
import { magicLinkUrl } from "../lib/auth-urls.ts";
import type { Bindings } from "../types.ts";
import {
  createDatabaseAuth,
  createDatabaseOAuthStateStore,
  findOrCreateByEmail,
} from "./database-adapter.ts";
import { resolveGitHubIdentity } from "./github-profile.ts";
import { resolveGoogleIdentity } from "./google-profile.ts";
import type { MarqueeUser } from "./model.ts";
import type { ProviderId } from "./providers.ts";

export interface Authentication {
  currentUser(rawSession: string): Promise<MarqueeUser | null>;
  logout(rawSession: string): Promise<void>;
  startOAuth(provider: ProviderId): Promise<URL>;
  completeOAuth(
    provider: ProviderId,
    code: string,
    state: string,
  ): Promise<AuthFlowResult<MarqueeUser>>;
  requestMagicLink(email: string, destination?: MagicLinkDestination): Promise<void>;
  completeMagicLink(token: string): Promise<AuthFlowResult<MarqueeUser>>;
}

export type MagicLinkDestination = { kind: "web" } | { kind: "native"; challenge: string };

export function createAuthentication(db: Database, env: Bindings, origin: string): Authentication {
  const auth = createDatabaseAuth(db);
  const github = () =>
    auth.use(
      createGitHubAuth<MarqueeUser>({
        clientId: requiredAuthSecret(env.GITHUB_CLIENT_ID),
        clientSecret: requiredAuthSecret(env.GITHUB_CLIENT_SECRET),
        redirectUri: `${origin}/api/auth/callback/github`,
        scopes: ["read:user"],
        stateStore: createDatabaseOAuthStateStore(db),
        resolveIdentity: resolveGitHubIdentity,
      }),
    ).providers.github;

  const google = () =>
    auth.use(
      createGoogleAuth<MarqueeUser>({
        clientId: requiredAuthSecret(env.GOOGLE_CLIENT_ID),
        clientSecret: requiredAuthSecret(env.GOOGLE_CLIENT_SECRET),
        redirectUri: `${origin}/api/auth/callback/google`,
        scopes: ["openid", "profile"],
        stateStore: createDatabaseOAuthStateStore(db),
        resolveIdentity: resolveGoogleIdentity,
      }),
    ).providers.google;
  const oauth = (provider: ProviderId) => (provider === "google" ? google() : github());

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
    startOAuth: (provider) => oauth(provider).startAuthorization(),
    completeOAuth: (provider, code, state) =>
      oauth(provider).completeAuthorization({ code, state }),
    requestMagicLink: async (email, destination = { kind: "web" }) => {
      await magicLink(destination).request(email);
    },
    completeMagicLink: (token) => magicLink().authenticate({ token }),
  };
}
