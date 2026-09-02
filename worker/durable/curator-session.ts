import { DurableObject } from "cloudflare:workers";

import { AiGatewayError } from "../clients/ai-gateway.ts";
import { withDatabase } from "../database/runtime.ts";
import { logError } from "../lib/logging.ts";
import { isRecord } from "../lib/values.ts";
import { curateStream, type CuratorTurn } from "../services/curator.ts";
import type { WorkerBindings } from "../types.ts";

const MAX_TURNS = 8;
const MAX_PROMPT = 1_000;
const MAX_VIEWER_ID = 128;
const MAX_PROVIDER_IDS = 24;
const IDLE_MINUTES = 60;

type AskRequest = {
  prompt: string;
  viewerId: string;
  providerIds?: string[];
  hour?: number;
  isWeekend?: boolean;
};

async function readAsk(request: Request): Promise<AskRequest | null> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    return null;
  }

  if (!isRecord(raw)) {
    return null;
  }

  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim().slice(0, MAX_PROMPT) : "";
  const viewerId = typeof raw.viewerId === "string" ? raw.viewerId.slice(0, MAX_VIEWER_ID) : "";

  if (!prompt) {
    return null;
  }

  return {
    prompt,
    viewerId,
    providerIds: Array.isArray(raw.providerIds)
      ? raw.providerIds
          .filter((value): value is string => typeof value === "string")
          .slice(0, MAX_PROVIDER_IDS)
      : [],
    hour: typeof raw.hour === "number" && Number.isFinite(raw.hour) ? raw.hour : undefined,
    isWeekend: typeof raw.isWeekend === "boolean" ? raw.isWeekend : undefined,
  };
}

export class CuratorSession extends DurableObject<WorkerBindings> {
  private generation = 0;

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/reset")) {
      await this.ctx.storage.deleteAll();

      return new Response(null, { status: 204 });
    }

    const body = await readAsk(request);

    if (!body) {
      return new Response(null, { status: 400 });
    }

    const turns = (await this.ctx.storage.get<CuratorTurn[]>("turns")) ?? [];
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const { signal } = request;
    const generation = (this.generation += 1);

    this.ctx.waitUntil(
      (async () => {
        let open = true;
        const send = async (payload: unknown) => {
          if (!open) {
            return;
          }

          try {
            await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            open = false;
          }
        };

        const current = () => generation === this.generation && !signal.aborted;

        try {
          await withDatabase(this.env, async (env) => {
            for await (const event of curateStream(env, body.prompt, body.viewerId, turns, {
              providerIds: body.providerIds ?? [],
              hour: body.hour,
              isWeekend: body.isWeekend,
              signal,
            })) {
              if (!open || !current()) {
                break;
              }

              if (event.type === "turn") {
                await this.ctx.storage.transaction(async (txn) => {
                  const latest = (await txn.get<CuratorTurn[]>("turns")) ?? [];

                  await txn.put("turns", [...latest, event.turn].slice(-MAX_TURNS));
                });
                await this.ctx.storage.setAlarm(Date.now() + IDLE_MINUTES * 60_000);
                continue;
              }

              await send(event);
            }
          });
        } catch (error) {
          logError("curator_session_failed", error);
          await send({ type: "error", message: curatorMessage(error) });
        } finally {
          await writer.close().catch(() => undefined);
        }
      })(),
    );

    return new Response(readable, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/event-stream",
        "x-content-type-options": "nosniff",
      },
    });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

function curatorMessage(error: unknown) {
  const status = error && typeof error === "object" && "status" in error ? error.status : null;

  if (status === 402) {
    if (error instanceof AiGatewayError && error.transport === "byok") {
      return "The configured AI provider has no available quota.";
    }

    return "The AI curator has used up its Cloudflare AI allowance.";
  }

  if (status === 429) {
    return "The AI curator is rate limited. Try again shortly.";
  }

  return "Cloudflare AI curator is unavailable";
}
