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

/**
 * Where a call's AI analysis is: `pending` while the model works (poll), then
 * `done` or `failed` for good (a pending one that never finished reads as failed).
 */
export type CallAnalysisStatus = "pending" | "done" | "failed";

/** The analysis of one issue. */
export interface CallFinding {
  node: string | null;
  /** The issue's index in `CallDetail.steps`. */
  step: number | null;
  /** Why it happened. */
  cause: string;
  /** A change to the agent that would prevent it; empty if none is needed. */
  suggestion: string;
}

/** The AI analysis of a call with issues (backend/src/api/calls/copilot_analyzer.py). */
export interface CallAnalysis {
  status: CallAnalysisStatus;
  /** done: what went wrong, in a few sentences. */
  summary: string | null;
  /** done: one per issue. */
  findings: CallFinding[];
  /** failed: why there's no analysis. */
  error: string | null;
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
  /** How many times customers flagged it. */
  flag_count: number;
}

/** A customer's report that a call went wrong. A new flag reruns the call's AI analysis. */
export interface CallFlag {
  id: number;
  /** What went wrong, in the customer's words. */
  reason: string;
  /** ISO 8601. */
  created_at: string;
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
  /** The AI analysis; null for a call without issues or flags. */
  analysis: CallAnalysis | null;
  /** Customers' flags, oldest first. */
  flags: CallFlag[];
  transcript: TranscriptTurn[];
  final_state: FlowState;
  events: CallEvent[];
}

/** One kind of issue at one node, across a version's calls (the Issues pane). */
export interface IssueGroup {
  kind: CallIssueKind;
  node: string | null;
  /** Calls it happened in. */
  call_count: number;
  /** Of those, calls that ended after the issues were last seen. */
  new_count: number;
  /** When the latest of those calls ended (ISO 8601). */
  last_at: string;
  /** The most recent of those calls (at most 20), newest first. */
  calls: { id: string; ended_at: string }[];
}

/** A customer's flag in the Issues pane. */
export interface IssueFlag {
  call_id: string;
  reason: string;
  /** ISO 8601. */
  created_at: string;
  /** Flagged after the issues were last seen. */
  new: boolean;
}

/** How one version of the agent did. */
export interface VersionIssues {
  version: number;
  call_count: number;
  /** Calls with an issue or a flag. */
  calls_with_issues: number;
  /** Failures first (stuck, error), then long stays. */
  groups: IssueGroup[];
  /** Newest first. */
  flags: IssueFlag[];
}

/** GET /api/agents/{id}/issues: the agent's issues across its calls, by version. */
export interface AgentIssues {
  /** When they were last seen (ISO 8601); null if never. */
  seen_at: string | null;
  /** Stuck and error calls plus flags since `seen_at`: the toolbar badge. */
  new_count: number;
  /** Newest first; only versions with calls. */
  versions: VersionIssues[];
}
