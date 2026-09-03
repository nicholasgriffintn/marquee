import type { ViewerAccess } from "../../src/domain/access.ts";
import type { ApiScope } from "../../src/domain/scopes.ts";
import { hasScope } from "../../src/domain/scopes.ts";
import type { MarqueeUser } from "../auth/model.ts";
import type { Bindings } from "../types.ts";
import { type ProtocolVersion, understandsStructuredOutput } from "./protocol.ts";
import { catalogueTools } from "./tools/catalogue.ts";
import { peopleTools } from "./tools/people.ts";
import { scheduleTools } from "./tools/schedule.ts";
import { shelfTools } from "./tools/shelf.ts";

export type ToolContext = {
  env: Bindings;
  user: MarqueeUser;
  origin: string;
  access: ViewerAccess;
};

export type ToolOutcome =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; requiredScope?: ApiScope };

export type JsonSchema = Record<string, unknown>;

export type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  scope: ApiScope;
  annotations: ToolAnnotations;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  run: (context: ToolContext, input: Record<string, unknown>) => Promise<ToolOutcome>;
};

export const READS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function answer(data: Record<string, unknown>): ToolOutcome {
  return { ok: true, data };
}

export function refuse(error: string, requiredScope?: ApiScope): ToolOutcome {
  return requiredScope ? { ok: false, error, requiredScope } : { ok: false, error };
}

export function awaitingApproval(change: Record<string, unknown>): ToolOutcome {
  return answer({ applied: false, approvalRequired: true, change });
}

export const CONFIRM_PROPERTY = {
  type: "boolean",
  description:
    "Set true to apply the change. Left out, the tool writes nothing and returns the change it would make so it can be approved first.",
} as const;

const TOOLS: readonly McpTool[] = [
  ...catalogueTools,
  ...shelfTools,
  ...scheduleTools,
  ...peopleTools,
];

export function toolsWithin(scopes: readonly ApiScope[]) {
  return TOOLS.filter((tool) => hasScope(scopes, tool.scope));
}

export function findTool(name: string) {
  return TOOLS.find((tool) => tool.name === name) ?? null;
}

export function describeTool(tool: McpTool, version: ProtocolVersion) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { title: tool.title, ...tool.annotations },
    ...(understandsStructuredOutput(version)
      ? { title: tool.title, outputSchema: tool.outputSchema }
      : {}),
  };
}
