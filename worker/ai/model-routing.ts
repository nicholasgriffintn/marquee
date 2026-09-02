import { withKvCache } from "../lib/cache.ts";
import { logEvent } from "../lib/logging.ts";
import {
  readViewerAiModel,
  type ViewerAiModelConfiguration,
} from "../repositories/viewer-ai-models.ts";
import type { Bindings } from "../types.ts";
import type { ModelTier } from "./policy.ts";

const WORKERS_AI_MODEL = /^@cf\/[a-z0-9._/-]{1,120}$/u;
const PROVIDER_MODEL = /^[a-z0-9][a-z0-9._/-]{0,159}$/u;
const PROVIDER_NATIVE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const BYOK_ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const LAST_RESORT_MODEL = "@cf/openai/gpt-oss-120b";
const CONFIGURATION_TTL_SECONDS = 300;

const CLOUDFLARE_PROVIDERS = new Set(["cerebras", "openai"]);
const BYOK_PROVIDER_PATHS = {
  cerebras: "cerebras/chat/completions",
  openai: "openai/chat/completions",
} as const;

type ByokProvider = keyof typeof BYOK_PROVIDER_PATHS;

export type AiTransport = "cloudflare" | "byok";

export type AiModelCandidate =
  | {
      transport: "cloudflare";
      requestModel: string;
      recordedModel: string;
    }
  | {
      transport: "byok";
      provider: ByokProvider;
      providerPath: string;
      byokAlias: string;
      requestModel: string;
      recordedModel: string;
    };

export type AiRoute = {
  source: "default" | "viewer";
  transport: AiTransport;
  candidates: AiModelCandidate[];
};

function defaultModel(env: Bindings) {
  if (!WORKERS_AI_MODEL.test(env.AI_MODEL)) {
    throw new Error("Cloudflare AI model is invalid");
  }

  return env.AI_MODEL;
}

function fastModel(env: Bindings, normal: string) {
  const configured = env.AI_FAST_MODEL;

  if (!configured) {
    return normal;
  }

  if (!WORKERS_AI_MODEL.test(configured)) {
    throw new Error("Cloudflare fast AI model is invalid");
  }

  return configured;
}

function candidate(model: string): AiModelCandidate {
  return { transport: "cloudflare", requestModel: model, recordedModel: model };
}

function defaultCandidates(env: Bindings, tier: ModelTier) {
  const normal = defaultModel(env);
  const fast = fastModel(env, normal);
  const models = tier === "fast" ? [fast, normal, LAST_RESORT_MODEL] : [normal, LAST_RESORT_MODEL];

  return [...new Set(models)].map(candidate);
}

function defaultRoute(env: Bindings, tier: ModelTier): AiRoute {
  return {
    source: "default",
    transport: "cloudflare",
    candidates: defaultCandidates(env, tier),
  };
}

function configurationFor(env: Bindings, viewerId: string) {
  return withKvCache(env, `ai-model:${viewerId}`, CONFIGURATION_TTL_SECONDS, async () => ({
    configuration: await readViewerAiModel(env.DB, viewerId),
  })).then((memo) => memo.configuration);
}

function configuredModel(provider: string, model: string) {
  if (provider === "workers-ai") {
    if (!WORKERS_AI_MODEL.test(model)) {
      throw new Error("Configured Workers AI model is invalid");
    }

    return model;
  }

  if (!CLOUDFLARE_PROVIDERS.has(provider) || !PROVIDER_MODEL.test(model)) {
    throw new Error("Configured Cloudflare AI provider or model is invalid");
  }

  return `${provider}/${model}`;
}

function isByokProvider(provider: string): provider is ByokProvider {
  return Object.hasOwn(BYOK_PROVIDER_PATHS, provider);
}

function byokCandidate(provider: string, model: string, alias: string | null): AiModelCandidate {
  if (!isByokProvider(provider) || !PROVIDER_NATIVE_MODEL.test(model)) {
    throw new Error("Configured BYOK provider or model is invalid");
  }

  if (!alias || !BYOK_ALIAS.test(alias)) {
    throw new Error("Configured BYOK alias is invalid");
  }

  return {
    transport: "byok",
    provider,
    providerPath: BYOK_PROVIDER_PATHS[provider],
    byokAlias: alias,
    requestModel: model,
    recordedModel: `${provider}/${model}`,
  };
}

function viewerRoute(
  env: Bindings,
  tier: ModelTier,
  configuration: ViewerAiModelConfiguration,
): AiRoute {
  if (configuration.credentialSource === "byok") {
    return {
      source: "viewer",
      transport: "byok",
      candidates: [
        byokCandidate(configuration.provider, configuration.model, configuration.byokAlias),
        ...defaultCandidates(env, tier),
      ],
    };
  }

  return {
    source: "viewer",
    transport: "cloudflare",
    candidates: [candidate(configuredModel(configuration.provider, configuration.model))],
  };
}

function recordRoute(route: AiRoute, reason?: "guest" | "unconfigured" | "invalid") {
  logEvent("ai_route_selected", {
    source: route.source,
    transport: route.transport,
    model: route.candidates[0].recordedModel,
    ...(reason ? { reason } : {}),
  });

  return route;
}

export async function resolveAiRoute(
  env: Bindings,
  viewerId: string | null,
  tier: ModelTier,
): Promise<AiRoute> {
  if (!viewerId) {
    return recordRoute(defaultRoute(env, tier), "guest");
  }

  const configuration = await configurationFor(env, viewerId);

  if (!configuration) {
    return recordRoute(defaultRoute(env, tier), "unconfigured");
  }

  try {
    return recordRoute(viewerRoute(env, tier, configuration));
  } catch {
    logEvent("ai_model_configuration_invalid", {
      provider: configuration.provider,
      credentialSource: configuration.credentialSource,
    });

    return recordRoute(defaultRoute(env, tier), "invalid");
  }
}

export function hasViewerAiModel(env: Bindings, viewerId: string) {
  return configurationFor(env, viewerId).then(Boolean);
}
