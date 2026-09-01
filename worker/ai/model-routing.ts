import { logEvent } from "../lib/logging.ts";
import { readViewerAiModel } from "../repositories/viewer-ai-models.ts";
import type { Bindings } from "../types.ts";
import type { ModelTier } from "./policy.ts";

const WORKERS_AI_MODEL = /^@cf\/[a-z0-9._/-]{1,120}$/u;
const PROVIDER_MODEL = /^[a-z0-9][a-z0-9._/-]{0,159}$/u;
const PROVIDER_NATIVE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const BYOK_ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const LAST_RESORT_MODEL = "@cf/openai/gpt-oss-120b";

const CLOUDFLARE_PROVIDERS = new Set(["cerebras", "openai"]);
const BYOK_PROVIDER_PATHS = {
  cerebras: "cerebras/chat/completions",
  openai: "openai/chat/completions",
} as const;

type ByokProvider = keyof typeof BYOK_PROVIDER_PATHS;

export type AiModelCandidate = {
  requestModel: string;
  recordedModel: string;
};

export type AiRoute =
  | {
      source: "default" | "viewer";
      transport: "cloudflare";
      candidates: AiModelCandidate[];
    }
  | {
      source: "viewer";
      transport: "byok";
      provider: ByokProvider;
      providerPath: string;
      byokAlias: string;
      candidates: [AiModelCandidate];
    };

const configurations = new WeakMap<Database, Map<string, ReturnType<typeof readViewerAiModel>>>();

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
  return { requestModel: model, recordedModel: model };
}

function defaultRoute(env: Bindings, tier: ModelTier): AiRoute {
  const normal = defaultModel(env);
  const fast = fastModel(env, normal);
  const models = tier === "fast" ? [fast, normal, LAST_RESORT_MODEL] : [normal, LAST_RESORT_MODEL];

  return {
    source: "default",
    transport: "cloudflare",
    candidates: [...new Set(models)].map(candidate),
  };
}

function configurationFor(env: Bindings, viewerId: string) {
  let databaseConfigurations = configurations.get(env.DB);

  if (!databaseConfigurations) {
    databaseConfigurations = new Map();
    configurations.set(env.DB, databaseConfigurations);
  }

  const cached = databaseConfigurations.get(viewerId);

  if (cached) {
    return cached;
  }

  const pending = readViewerAiModel(env.DB, viewerId);

  databaseConfigurations.set(viewerId, pending);

  return pending;
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

function byokRoute(provider: string, model: string, alias: string | null): AiRoute {
  if (!isByokProvider(provider) || !PROVIDER_NATIVE_MODEL.test(model)) {
    throw new Error("Configured BYOK provider or model is invalid");
  }

  if (!alias || !BYOK_ALIAS.test(alias)) {
    throw new Error("Configured BYOK alias is invalid");
  }

  return {
    source: "viewer",
    transport: "byok",
    provider,
    providerPath: BYOK_PROVIDER_PATHS[provider],
    byokAlias: alias,
    candidates: [
      {
        requestModel: model,
        recordedModel: `${provider}/${model}`,
      },
    ],
  };
}

function recordRoute(route: AiRoute, reason?: "guest" | "unconfigured") {
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

  let route: AiRoute;

  try {
    route =
      configuration.credentialSource === "byok"
        ? byokRoute(configuration.provider, configuration.model, configuration.byokAlias)
        : {
            source: "viewer",
            transport: "cloudflare",
            candidates: [candidate(configuredModel(configuration.provider, configuration.model))],
          };
  } catch (error) {
    logEvent("ai_model_configuration_invalid", {
      provider: configuration.provider,
      credentialSource: configuration.credentialSource,
    });

    throw error;
  }

  return recordRoute(route);
}

export function hasViewerAiModel(env: Bindings, viewerId: string) {
  return configurationFor(env, viewerId).then(Boolean);
}
