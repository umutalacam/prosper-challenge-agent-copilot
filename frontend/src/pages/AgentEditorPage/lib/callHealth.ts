// What a call's "stuck" signals mean. The recorder marks a node where the bot
// replied several times without an action; on its own that's often just a
// conversation (a greeting collecting a name and a date of birth). It's a
// problem only when the call never got past that node.

import type { CallEvent, CallSummary, TranscriptTurn } from "@/shared/types/call";

type StuckSignals = Pick<CallSummary, "outcome" | "end_node" | "stuck_nodes">;

/** The node the call got stuck in: it improvised there and ended there, unfinished. */
export function stuckNode({ outcome, end_node, stuck_nodes }: StuckSignals): string | null {
  return outcome !== "completed" && end_node !== null && stuck_nodes.includes(end_node)
    ? end_node
    : null;
}

/** Nodes where the bot needed many replies but the call still moved on: worth a look, not a failure. */
export function longStays(call: StuckSignals): string[] {
  const stuck = stuckNode(call);
  return call.stuck_nodes.filter((node) => node !== stuck);
}

/** The nodes a call's timeline marked as stuck, once each, in order. */
export function stuckNodesOf(events: readonly CallEvent[]): string[] {
  const nodes = events.flatMap((event) => (event.type === "stuck" ? [event.node] : []));
  return [...new Set(nodes)];
}

/** How many times the bot spoke in a node. */
export function botRepliesIn(turns: readonly TranscriptTurn[], node: string): number {
  return turns.filter((turn) => turn.speaker === "bot" && turn.node === node).length;
}
