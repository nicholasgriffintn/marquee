import type { MiddlewareHandler } from "hono";

import { recordEvent } from "../lib/events.ts";
import { jsonResponse } from "../lib/http.ts";
import type { Bindings } from "../types.ts";
import { allowsBot, assessBot } from "./bots.ts";
import { requestIdentity } from "./identity.ts";
import { matchPolicy } from "./policies.ts";

const RETRY_AFTER = "60";

export const apiGuard: MiddlewareHandler<{ Bindings: Bindings }> = async (context, next) => {
  const matched = matchPolicy(context.req.path, context.req.method);

  if (!matched) {
    return next();
  }

  const identity = await requestIdentity(context.env, context.req.raw);

  if (!identity.member && context.env.BOT_PROTECTION !== "off") {
    const verdict = assessBot(context.req.raw);

    if (!allowsBot(matched.policy.bots, verdict)) {
      recordEvent(context.env, {
        name: "guard_blocked",
        detail: `${matched.name}:${verdict.reason}`,
      });

      return jsonResponse({ error: "Automated traffic is not allowed here." }, 403);
    }
  }

  const tier = identity.member ? matched.policy.member : matched.policy.anonymous;
  const { success } = await context.env[tier.limiter].limit({
    key: `${matched.name}:${identity.key}`,
  });

  if (!success) {
    recordEvent(context.env, {
      name: "guard_throttled",
      viewerId: identity.userId ?? undefined,
      detail: matched.name,
    });

    return jsonResponse({ error: tier.message }, 429, { "retry-after": RETRY_AFTER });
  }

  return next();
};
