import { sha256Hex } from "../lib/hash.ts";
import type { Bindings } from "../types.ts";

const CACHE_SECONDS = 86_400;

export async function cachedWorkersAiOptions(
  env: Bindings,
  feature: string,
  model: string,
  input: unknown,
): Promise<AiOptions> {
  return {
    gateway: {
      id: env.AI_GATEWAY_ID,
      skipCache: false,
      cacheTtl: CACHE_SECONDS,
      cacheKey: `marquee-worker-v1-${await sha256Hex(`${model}:${JSON.stringify(input)}`)}`,
      collectLog: true,
      metadata: { feature },
    },
  };
}
