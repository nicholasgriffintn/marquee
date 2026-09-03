import { Hono } from "hono";

import type { ApiScope } from "../../src/domain/scopes.ts";
import { hasScope } from "../../src/domain/scopes.ts";
import { bearerIdentity } from "../auth/api-tokens.ts";
import { readJsonObject } from "../lib/http.ts";
import { logError } from "../lib/logging.ts";
import { canonicalOrigin } from "../lib/security.ts";
import { isRecord } from "../lib/values.ts";
import {
  fail,
  negotiateProtocol,
  ok,
  type ProtocolVersion,
  requestProtocol,
  SERVER_INFO,
  understandsStructuredOutput,
} from "../mcp/protocol.ts";
import {
  describeTool,
  findTool,
  type ToolContext,
  type ToolOutcome,
  toolsWithin,
} from "../mcp/registry.ts";
import { readViewerAccess } from "../services/viewer/access.ts";
import type { Bindings } from "../types.ts";

export const mcpRoutes = new Hono<{ Bindings: Bindings }>();

function toolResponse(outcome: ToolOutcome, version: ProtocolVersion) {
  if (!outcome.ok) {
    const payload = outcome.requiredScope
      ? { error: outcome.error, requiredScope: outcome.requiredScope }
      : { error: outcome.error };

    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: true };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(outcome.data, null, 2) }],
    ...(understandsStructuredOutput(version) ? { structuredContent: outcome.data } : {}),
    isError: false,
  };
}

async function runTool(
  context: ToolContext,
  scopes: readonly ApiScope[],
  name: string,
  input: Record<string, unknown>,
): Promise<ToolOutcome> {
  const tool = findTool(name);

  if (!tool) {
    return { ok: false, error: `Unknown tool ${name}` };
  }

  if (!hasScope(scopes, tool.scope)) {
    return {
      ok: false,
      error: `This token was not granted ${tool.scope}, so ${tool.name} is not available to it. Mint a token with that scope on the Sources page.`,
      requiredScope: tool.scope,
    };
  }

  return tool.run(context, input);
}

mcpRoutes.all("/", async (context) => {
  if (context.req.method !== "POST") {
    return context.json({ error: "Use POST with JSON-RPC" }, 405, { allow: "POST" });
  }

  const identity = await bearerIdentity(context.env, context.req.raw);

  if (!identity) {
    return context.json({ error: "A Marquee API token is required" }, 401, {
      "www-authenticate": 'Bearer realm="marquee"',
    });
  }

  const body = await readJsonObject(context.req.raw);

  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return context.json(fail(null, -32_600, "Invalid JSON-RPC request"), 400);
  }

  const { id, method } = body;

  if (method.startsWith("notifications/")) {
    return context.body(null, 202);
  }

  if (method === "initialize") {
    const parameters = isRecord(body.params) ? body.params : {};

    return context.json(
      ok(id, {
        protocolVersion: negotiateProtocol(parameters.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      }),
    );
  }

  if (method === "ping") {
    return context.json(ok(id, {}));
  }

  const version = requestProtocol(context.req.raw);

  if (method === "tools/list") {
    return context.json(
      ok(id, {
        tools: toolsWithin(identity.scopes).map((tool) => describeTool(tool, version)),
      }),
    );
  }

  if (method === "tools/call") {
    const parameters = isRecord(body.params) ? body.params : {};
    const name = typeof parameters.name === "string" ? parameters.name : "";
    const input = isRecord(parameters.arguments) ? parameters.arguments : {};

    try {
      const outcome = await runTool(
        {
          env: context.env,
          user: identity.user,
          origin: canonicalOrigin(context.req.raw, context.env.SITE_ORIGIN),
          access: await readViewerAccess(context.env.DB, identity.user.id),
        },
        identity.scopes,
        name,
        input,
      );

      return context.json(ok(id, toolResponse(outcome, version)));
    } catch (error) {
      logError("mcp_tool_failed", error, { tool: name });

      return context.json(ok(id, toolResponse({ ok: false, error: "The tool failed" }, version)));
    }
  }

  return context.json(fail(id, -32_601, `Unknown method ${method}`), 404);
});
