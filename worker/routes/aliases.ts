import { Hono } from "hono";

import { aliasTarget, ROUTE_ALIASES } from "../../src/lib/aliases.ts";
import type { Bindings } from "../types.ts";

export const aliasRoutes = new Hono<{ Bindings: Bindings }>();

for (const alias of Object.keys(ROUTE_ALIASES)) {
  aliasRoutes.on(["GET", "HEAD"], alias, (context) => {
    const target = aliasTarget(alias, new URL(context.req.url).search);

    context.header("cache-control", "public, max-age=86400");

    return context.redirect(target ?? "/", 301);
  });
}
