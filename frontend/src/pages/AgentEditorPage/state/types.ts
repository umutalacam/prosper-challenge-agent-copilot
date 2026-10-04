import type { Agent, AgentAction, AgentNode, Position } from "@/shared/types/agent";

/**
 * What the inspector card is editing: nothing (card closed), the agent's settings,
 * a node (by name) or an action (by node name + index).
 */
export type Selection =
  | { kind: "none" }
  | { kind: "agent" }
  | { kind: "node"; node: string }
  | { kind: "action"; node: string; index: number };

export interface EditorState {
  /** The working copy — the single source of truth the canvas and forms derive from. */
  agent: Agent;
  /** True when `agent` differs from what was last loaded or saved. */
  dirty: boolean;
  selection: Selection;
  /**
   * True while the copilot is editing: the editor is read-only and the reducer
   * refuses every edit except the copilot's own (`copilotEdit`).
   */
  locked: boolean;
}

export type AgentPatch = Partial<Omit<Agent, "nodes">>;
export type NodePatch = Partial<Omit<AgentNode, "name" | "edges">>;
export type ActionPatch = Partial<AgentAction>;

export type EditorAction =
  /** `agent` is the exact snapshot that was sent; later edits keep the editor dirty. */
  | { type: "saved"; agent: Agent }
  | { type: "select"; selection: Selection }
  | { type: "updateAgent"; patch: AgentPatch }
  /** The whole document, e.g. edited as raw JSON. */
  | { type: "replaceAgent"; agent: Agent }
  /** Lock or unlock the editor around a copilot turn; locking clears the selection. */
  | { type: "setLocked"; locked: boolean }
  /** The copilot's edit: the whole document, applied even while locked. */
  | { type: "copilotEdit"; agent: Agent }
  | { type: "addNode"; position: Position }
  | { type: "updateNode"; node: string; patch: NodePatch }
  | { type: "renameNode"; from: string; to: string }
  | { type: "deleteNode"; node: string }
  | { type: "moveNodes"; positions: Record<string, Position> }
  | { type: "addAction"; source: string; target: string }
  /** The canvas "+" under a node: a new node at `position`, reached by a new action. */
  | { type: "addNodeAfter"; source: string; position: Position }
  | { type: "updateAction"; node: string; index: number; patch: ActionPatch }
  | { type: "deleteAction"; node: string; index: number };
