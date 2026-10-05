import type { CallIssueKind } from "./call";

// TS mirror of the copilot's stream (backend/src/api/copilot/service.py).

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A finding of a call's AI analysis to fix ("Fix with copilot"): it starts the
 * turn at the copilot's fix node instead of a typed prompt.
 */
export interface CopilotFix {
  /** The call the finding is from. */
  call_id: string;
  node: string | null;
  step: number | null;
  cause: string;
  suggestion: string;
}

/**
 * An issue group to fix across its calls ("Fix with copilot" in the Issues pane):
 * starts the turn at the copilot's group_fix node, which proposes one fix and asks.
 */
export interface CopilotGroupFix {
  kind: CallIssueKind;
  node: string | null;
  version: number;
  call_count: number;
  /** What the calls' analyses say caused it. */
  causes: string[];
  /** The fix proposed so far, sent back with each reply while the user talks it over. */
  proposal?: string;
}

export interface CopilotQuestion {
  question: string;
  /** Short suggested answers, when the copilot can predict them. */
  options?: string[];
  /** Several options can apply at once: pick any number (checkboxes), not one. */
  multiple?: boolean;
}

/** One line of POST /api/copilot/turns. */
export type CopilotEvent =
  /** What it's doing right now ("Thinking…"); replaced by the next activity. */
  | { type: "activity"; text: string }
  /** The model's own words mid-turn, alongside its edits. */
  | { type: "note"; text: string }
  /** An edit it made (ok) or that was refused (the reason, which it then acts on). */
  | { type: "step"; text: string; ok: boolean }
  /** The agent document after an edit; replaces the editor's working copy. */
  | { type: "agent"; agent: unknown }
  | { type: "reply"; text: string }
  | { type: "questions"; questions: CopilotQuestion[] }
  /** A group fix still being talked over: the fix as it stands; send it back with the next reply. */
  | { type: "proposal"; suggestion: string }
  | { type: "error"; message: string }
  | { type: "done" };
