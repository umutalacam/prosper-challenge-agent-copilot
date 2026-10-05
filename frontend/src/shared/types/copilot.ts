// TS mirror of the copilot's stream (backend/src/api/copilot/service.py).

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
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
  | { type: "error"; message: string }
  | { type: "done" };
