import { DurableObject } from "cloudflare:workers";

import { logError } from "../lib/logging.ts";
import { curateStream, type CuratorTurn } from "../services/curator.ts";
import type { Bindings } from "../types.ts";

const MAX_TURNS = 8;
const IDLE_MINUTES = 60;

type AskRequest = {
  prompt: string;
  viewerId: string;
  providerIds?: string[];
  hour?: number;
  isWeekend?: boolean;
};

export class CuratorSession extends DurableObject<Bindings> {
  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/reset")) {
      await this.ctx.storage.deleteAll();

      return new Response(null, { status: 204 });
    }

    const body = (await request.json()) as AskRequest;
    const turns = (await this.ctx.storage.get<CuratorTurn[]>("turns")) ?? [];
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    this.ctx.waitUntil(
      (async () => {
        try {
          for await (const event of curateStream(this.env, body.prompt, body.viewerId, turns, {
            providerIds: body.providerIds ?? [],
            hour: body.hour,
            isWeekend: body.isWeekend,
          })) {
            if (event.type === "turn") {
              await this.ctx.storage.transaction(async (txn) => {
                const latest = (await txn.get<CuratorTurn[]>("turns")) ?? [];

                await txn.put("turns", [...latest, event.turn].slice(-MAX_TURNS));
              });
              await this.ctx.storage.setAlarm(Date.now() + IDLE_MINUTES * 60_000);
              continue;
            }

            await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        } catch (error) {
          logError("curator_session_failed", error);
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: curatorMessage(error) })}\n\n`,
            ),
          );
        } finally {
          await writer.close();
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
    return "The AI curator has used up its Cloudflare AI allowance.";
  }

  if (status === 429) {
    return "The AI curator is rate limited. Try again shortly.";
  }

  return "Cloudflare AI curator is unavailable";
}
