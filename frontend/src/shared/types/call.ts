// TS mirror of the stored calls API (backend/src/api/calls/): an agent's calls
// at GET /api/agents/{id}/calls and one call at GET /api/agents/{id}/calls/{call_id}.

/** How a call ended. */
export type CallOutcome = "completed" | "abandoned" | "not_started" | "error";

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
  /** Nodes where the bot improvised (replied repeatedly without an action). */
  stuck_nodes: string[];
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
export interface CallDetail extends Omit<CallSummary, "stuck_nodes"> {
  agent_id: string;
  agent_name: string;
  /** ISO 8601. */
  ended_at: string;
  transcript: TranscriptTurn[];
  final_state: FlowState;
  events: CallEvent[];
}
