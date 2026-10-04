// The agent as raw JSON, for the editor's JSON view: format the working copy,
// and parse an edited copy back. Parsing checks only the shape the editor needs
// to render; everything else (start node exists, action targets exist, unique
// names) is AgentBuilder's job when the agent is saved.

import { normalizeAgent, type WireAgentDocument } from "@/shared/api";
import type { Agent } from "@/shared/types/agent";

/** Server metadata a stored agent carries; not part of the document. */
const METADATA_KEYS = ["id", "version", "updated_at"];

/** The agent document as the backend stores it: no id, version or timestamp. */
export function agentDocument(agent: Agent): Record<string, unknown> {
  return Object.fromEntries(Object.entries(agent).filter(([key]) => !METADATA_KEYS.includes(key)));
}

export function formatAgentJson(agent: Agent): string {
  return JSON.stringify(agentDocument(agent), null, 2);
}

export type ParseResult = { ok: true; agent: Agent } | { ok: false; error: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Why `value` isn't shaped like an agent, or null if it is. */
function shapeError(value: unknown): string | null {
  if (!isObject(value)) return "The JSON must be an object.";
  if (typeof value.name !== "string") return '"name" must be a string.';
  if (typeof value.initial_node !== "string") return '"initial_node" must be a string.';
  if (!Array.isArray(value.nodes)) return '"nodes" must be an array.';
  for (const [i, node] of value.nodes.entries()) {
    if (!isObject(node) || typeof node.name !== "string") {
      return `nodes[${i}] must be an object with a string "name".`;
    }
    if (node.edges !== undefined) {
      if (!Array.isArray(node.edges)) return `nodes[${i}].edges must be an array.`;
      for (const [j, edge] of node.edges.entries()) {
        if (
          !isObject(edge) ||
          typeof edge.function !== "string" ||
          typeof edge.target !== "string"
        ) {
          return `nodes[${i}].edges[${j}] needs a string "function" and "target".`;
        }
      }
    }
    if (node.task_messages !== undefined && !Array.isArray(node.task_messages)) {
      return `nodes[${i}].task_messages must be an array.`;
    }
  }
  return null;
}

export function parseAgentJson(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const error = shapeError(value);
  if (error) return { ok: false, error };
  const document = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !METADATA_KEYS.includes(key),
    ),
  ) as WireAgentDocument;
  return { ok: true, agent: normalizeAgent(document) };
}
