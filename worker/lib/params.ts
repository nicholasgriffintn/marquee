import type { Context } from "hono";

import { boundedInteger } from "./numbers.ts";

type QueryContext = Pick<Context, "req">;

export function queryInteger(
  context: QueryContext,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  return boundedInteger(context.req.query(name), fallback, minimum, maximum);
}

export function queryText(context: QueryContext, name: string, maxLength: number) {
  return (context.req.query(name) ?? "").trim().slice(0, maxLength);
}

export function queryList(context: QueryContext, name: string, limit: number) {
  return (context.req.query(name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function pathInteger(context: QueryContext, name: string, minimum: number, maximum: number) {
  const parsed = Number(context.req.param(name));

  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}
