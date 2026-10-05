// TS mirror of the stored calls API (backend/src/api/calls/): an agent's calls
// at GET /api/agents/{id}/calls and one call at GET /api/agents/{id}/calls/{call_id}.

/** How a call ended. */
export type CallOutcome = "completed" | "abandoned" | "not_started" | "error";

/**
 * What went wrong in a call, judged by the backend (CallRecord.issues):
 * `stuck` = the bot improvised in the node the call ended in, unfinished (a
 * failure); `long_stay` = it improvised but the call moved on (a note, not a
 * failure); `error` = the pipeline raised.
 */
export type CallIssueKind = "stuck" | "long_stay" | "error";

export interface CallIssue {
  kind: CallIssueKind;
  /** Where it happened; null for an error before the flow started. */
  node: string | null;
  /** Its index in `CallDetail.steps`; null if the flow never started. */
  step: number | null;
  /** Milliseconds since the call started. */
  at_ms: number;
  /** stuck / long_stay: the bot reply that tipped it. */
  replies: number | null;
  /** error: what the pipeline raised. */
  message: string | null;
}

/** One stay in a node, in the order the call walked them. */
export interface PathStep {
  node: string;
  /** When the call entered it, in ms since the call started. */
  entered_ms: number;
  /** How long the call stayed. */
  stay_ms: number;
  /** Bot replies during the stay. */
  replies: number;
  /** The action that took the call on, and what it collected; null for the last step. */
  exit: { function: string; args: Record<string, unknown> } | null;
  /** How the call ended here; null if it moved on. */
  ending: CallOutcome | null;
}

/** One call in the list (no timeline). */
export interface CallSummary {
  id: string;
  agent_version: number;
  /** ISO 8601. */
  started_at: string;
  duration_ms: number;
  outcome: CallOutcome;
  /** The node the call ended in; null if the flow never started. */
  end_node: string | null;
  /** The nodes it visited, in order. */
  path: string[];
  /** What went wrong, in timeline order; empty for a clean call. */
  issues: CallIssue[];
}

/** One turn of what was said. */
export interface TranscriptTurn {
  speaker: "caller" | "bot";
  /** The node the call was in. */
  node: string | null;
  text: string;
  /** Milliseconds since the call started. */
  at_ms: number;
  /** The caller cut this bot turn off. */
  interrupted?: true;
}

type FlowState = Record<string, unknown>;

/** One entry of a call's timeline (backend/src/api/calls/recorder.py), by `type`. */
export type CallEvent = { at_ms: number } & (
  | { type: "started"; node: string }
  | { type: "caller"; node: string | null; text: string }
  | { type: "bot"; node: string; text: string; reply: number; interrupted: boolean }
  | {
      type: "transition";
      from: string;
      to: string;
      function: string;
      args: Record<string, unknown>;
      /** The flow's state after this step. */
      state: FlowState;
    }
  | { type: "stuck"; node: string; replies: number }
  | { type: "ended"; node: string | null; outcome: CallOutcome }
  | { type: "error"; message: string }
);

/** One call in full. */
export interface CallDetail extends CallSummary {
  agent_id: string;
  agent_name: string;
  /** ISO 8601. */
  ended_at: string;
  /** The walk through the agent; empty if the flow never started. */
  steps: PathStep[];
  transcript: TranscriptTurn[];
  final_state: FlowState;
  events: CallEvent[];
}
