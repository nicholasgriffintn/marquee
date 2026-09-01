import { logError } from "../lib/logging.ts";
import { isRailRefreshJob } from "../lib/validation.ts";
import { runScheduledRailRefresh } from "../services/rail-refresh.ts";
import type { Bindings, RailRefreshJob } from "../types.ts";

async function defer(
  message: Message<unknown>,
  env: Bindings,
  job: RailRefreshJob,
  delaySeconds: number,
) {
  try {
    await env.RAIL_REFRESH_QUEUE.send(job, { delaySeconds });
    message.ack();
  } catch (error) {
    logError("rail_refresh_defer_failed", error, { attempt: message.attempts });
    message.retry({ delaySeconds: Math.min(300, 30 * message.attempts) });
  }
}

export async function consumeRailRefresh(batch: MessageBatch<unknown>, env: Bindings) {
  for (const message of batch.messages) {
    if (!isRailRefreshJob(message.body)) {
      logError("rail_refresh_job_invalid", new Error("Invalid rail refresh job"), {
        messageId: message.id,
      });
      message.ack();
      continue;
    }

    try {
      // oxlint-disable-next-line no-await-in-loop
      const result = await runScheduledRailRefresh(env, message.body);

      if (result.action === "defer") {
        // oxlint-disable-next-line no-await-in-loop
        await defer(message, env, message.body, result.delaySeconds);
      } else {
        message.ack();
      }
    } catch (error) {
      logError("rail_refresh_failed", error, { attempt: message.attempts });
      message.retry({ delaySeconds: Math.min(300, 30 * message.attempts) });
    }
  }
}

export async function consumeRailRefreshDeadLetters(batch: MessageBatch<unknown>) {
  for (const message of batch.messages) {
    logError("rail_refresh_dead_letter", new Error("Rail refresh retries exhausted"), {
      messageId: message.id,
      attempts: message.attempts,
    });
    message.ack();
  }
}
