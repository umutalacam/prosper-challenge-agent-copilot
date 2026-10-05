// A call's walk through the agent as steps, from its timeline: when it entered
// each node, how long it stayed, which action took it on (with what that action
// collected), and how it ended. Pure, for the call overview.

import type { CallDetail, CallEvent, CallOutcome } from "@/shared/types/call";
import { longStays, stuckNode, stuckNodesOf } from "./callHealth";

type Transition = Extract<CallEvent, { type: "transition" }>;

/** One node the call passed through. */
export interface PathStep {
  node: string;
  /** When the call entered it, in ms since the call started; null if the timeline doesn't say. */
  enteredMs: number | null;
  /** How long the call stayed in it; null if the timeline doesn't say. */
  stayMs: number | null;
  /** The action that took the call on, and what it collected; null for the last step. */
  exit: { function: string; args: Record<string, unknown> } | null;
  /** How the call ended here; null if it moved on. */
  ending: CallOutcome | null;
  /** The bot needed many replies here (a note, not a failure). */
  longStay: boolean;
  /** The call got stuck and ended here. */
  stuck: boolean;
}

/**
 * The steps of a call: one per node in its ``path``. Timing and the actions
 * between nodes come from the timeline's ``started`` / ``transition`` events where
 * they line up with the path; without them the steps still render, untimed.
 */
export function pathSteps(call: CallDetail): PathStep[] {
  const start = call.events.find((event) => event.type === "started");
  const transitions = call.events.filter(
    (event): event is Transition => event.type === "transition",
  );
  // Into node i: the call's start for the first, the (i-1)th transition after that.
  const enteredAt = (i: number): number | null => {
    if (i === 0) return start !== undefined && start.node === call.path[0] ? start.at_ms : null;
    const into = transitions[i - 1];
    return into !== undefined && into.to === call.path[i] ? into.at_ms : null;
  };
  const signals = { ...call, stuck_nodes: stuckNodesOf(call.events) };
  const slow = new Set(longStays(signals));
  const stuckIn = stuckNode(signals);

  return call.path.map((node, i) => {
    const last = i === call.path.length - 1;
    const entered = enteredAt(i);
    const left = last ? call.duration_ms : enteredAt(i + 1);
    const exit = last ? undefined : transitions[i];
    return {
      node,
      enteredMs: entered,
      stayMs: entered !== null && left !== null ? Math.max(0, left - entered) : null,
      exit: exit?.from === node ? { function: exit.function, args: exit.args } : null,
      ending: last ? call.outcome : null,
      longStay: slow.has(node),
      stuck: last && stuckIn === node,
    };
  });
}
