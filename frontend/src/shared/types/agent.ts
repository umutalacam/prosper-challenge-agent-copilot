// TS mirror of backend/agent_builder/schema.py — the agent JSON contract.
// Keep in sync with schema.py. `position` is UI-only layout that the backend ignores.

export type FieldType = "string" | "number" | "boolean";

/** JSON-schema property for one value an action collects from the caller. */
export interface FieldSchema {
  type: FieldType;
  description?: string;
  enum?: string[];
}

/** An action (schema `Edge`): a function the LLM calls to move to `target`. */
export interface AgentAction {
  function: string;
  description: string;
  target: string;
  properties: Record<string, FieldSchema>;
  required: string[];
}

export interface TaskMessage {
  role: string;
  content: string;
}

export interface Position {
  x: number;
  y: number;
}

/** A conversation state (schema `Node`). */
export interface AgentNode {
  name: string;
  task_messages: TaskMessage[];
  role_message?: string | null;
  edges: AgentAction[];
  pre_actions?: unknown[];
  post_actions?: unknown[];
  end?: boolean;
  position?: Position;
}

export interface Agent {
  name: string;
  initial_node: string;
  persona: string;
  voice_id?: string;
  model?: string;
  nodes: AgentNode[];
}

/** An agent as stored by the API, identified by its file slug. */
export interface StoredAgent extends Agent {
  id: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  node_count: number;
}
