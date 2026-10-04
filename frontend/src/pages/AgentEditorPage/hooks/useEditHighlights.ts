import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent } from "@/shared/types/agent";
import {
  EMPTY_DIFF,
  isEmptyDiff,
  nodesInView,
  type ActionKey,
  type AgentDiff,
} from "../lib/agentDiff";

/** How long a touched node or action stays highlighted (matches the canvas animations). */
export const HIGHLIGHT_MS = 1800;

/** Bring these nodes into view. A new `seq` re-triggers, even for the same nodes. */
export interface FocusRequest {
  readonly nodes: readonly string[];
  readonly seq: number;
}

/** Which edit (by id) last highlighted each node / action; a later edit takes an item over. */
interface Owners {
  nodes: Map<string, number>;
  actions: Map<ActionKey, number>;
}

/** Take `id`'s items out of `owners` and return them: the ones no later edit took over. */
function release<K extends string>(owners: Map<K, number>, keys: Iterable<K>, id: number): Set<K> {
  const released = new Set<K>();
  for (const key of keys) {
    if (owners.get(key) === id) {
      owners.delete(key);
      released.add(key);
    }
  }
  return released;
}

function without<K, V>(map: ReadonlyMap<K, V>, keys: ReadonlySet<K>): ReadonlyMap<K, V> {
  return new Map([...map].filter(([key]) => !keys.has(key)));
}

/**
 * Canvas feedback for edits made outside the canvas (the copilot): `show(diff)`
 * highlights what an edit touched for HIGHLIGHT_MS and asks the canvas to bring
 * it into view. Each item stays highlighted for the full time after its latest edit.
 */
export function useEditHighlights() {
  const [highlights, setHighlights] = useState<AgentDiff>(EMPTY_DIFF);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const owners = useRef<Owners>({ nodes: new Map(), actions: new Map() });
  const timers = useRef(new Set<number>());
  const lastId = useRef(0);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
    };
  }, []);

  const show = useCallback((diff: AgentDiff, agent: Agent) => {
    if (isEmptyDiff(diff)) return;
    const id = ++lastId.current;
    diff.nodes.forEach((_, name) => owners.current.nodes.set(name, id));
    diff.actions.forEach((_, key) => owners.current.actions.set(key, id));
    setHighlights((current) => ({
      nodes: new Map([...current.nodes, ...diff.nodes]),
      actions: new Map([...current.actions, ...diff.actions]),
    }));

    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      // Decided here, not in the state updater: updaters must be pure (StrictMode runs them twice).
      const nodes = release(owners.current.nodes, diff.nodes.keys(), id);
      const actions = release(owners.current.actions, diff.actions.keys(), id);
      if (nodes.size === 0 && actions.size === 0) return;
      setHighlights((current) => ({
        nodes: without(current.nodes, nodes),
        actions: without(current.actions, actions),
      }));
    }, HIGHLIGHT_MS);
    timers.current.add(timer);

    const nodes = nodesInView(diff, agent);
    if (nodes.length > 0) setFocusRequest((last) => ({ nodes, seq: (last?.seq ?? 0) + 1 }));
  }, []);

  return { highlights, focusRequest, show };
}
