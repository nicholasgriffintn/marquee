import type { Bindings } from "../types.ts";

export type ProviderId = "github" | "google";

export function configuredProviders(env: Bindings) {
  const providers: { id: ProviderId; label: string }[] = [];

  if (env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim()) {
    providers.push({ id: "github", label: "Continue with GitHub" });
  }

  if (env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim()) {
    providers.push({ id: "google", label: "Continue with Google" });
  }

  return providers;
}
