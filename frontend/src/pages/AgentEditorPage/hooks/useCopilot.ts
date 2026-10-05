import { useCallback, useEffect, useRef, useState } from "react";
import {
  errorMessage,
  normalizeAgent,
  streamCopilotTurn,
  type WireAgentDocument,
} from "@/shared/api";
import type { Agent } from "@/shared/types/agent";
import type {
  CopilotEvent,
  CopilotFix,
  CopilotMessage,
  CopilotQuestion,
} from "@/shared/types/copilot";
import { agentDocument } from "../lib/agentJson";

export type CopilotStep =
  { kind: "edit"; text: string; ok: boolean } | { kind: "note"; text: string };

/** One prompt and everything the copilot did about it. */
export interface CopilotTurn {
  id: number;
  /** What was sent; for a fix, the finding as text (it's the history later turns see). */
  prompt: string;
  /** A fix turn: the finding it fixes, shown as a card instead of the prompt. */
  fix?: CopilotFix;
  status: "running" | "done" | "stopped" | "error";
  /** What it's doing right now, while running. */
  activity: string | null;
  steps: CopilotStep[];
  reply?: string;
  questions?: CopilotQuestion[];
  error?: string;
}

export interface UseCopilotOptions {
  /** The editor's working copy at the moment a prompt is sent. */
  getAgent: () => Agent;
  /** Each edit's result: becomes the working copy (live, unsaved). */
  onAgent: (agent: Agent) => void;
  /** A turn finished (or stopped) having changed the agent. */
  onTurnEnd?: (changed: boolean) => void;
}

/**
 * A fix turn's prompt: only a label, the conversation history later turns see.
 * The finding itself goes as `fix`; the backend's fix node words it for the model.
 */
export function fixPrompt({ node }: CopilotFix): string {
  return node
    ? `Fix the problem a call ran into in "${node}".`
    : "Fix the problem a call ran into.";
}

/** What the copilot said in a turn, as history for the next one. */
function assistantText(turn: CopilotTurn): string {
  const questions = turn.questions?.map((q) => `- ${q.question}`).join("\n");
  return [turn.reply, questions && `I asked:\n${questions}`, turn.error && `(Error: ${turn.error})`]
    .filter(Boolean)
    .join("\n\n");
}

function historyOf(turns: CopilotTurn[]): CopilotMessage[] {
  return turns.flatMap((turn) => {
    const answer = assistantText(turn);
    return [
      { role: "user" as const, content: turn.prompt },
      ...(answer ? [{ role: "assistant" as const, content: answer }] : []),
    ];
  });
}

function applyEvent(turn: CopilotTurn, event: CopilotEvent): CopilotTurn {
  switch (event.type) {
    case "activity":
      return { ...turn, activity: event.text };
    case "note":
      return { ...turn, steps: [...turn.steps, { kind: "note", text: event.text }] };
    case "step":
      return { ...turn, steps: [...turn.steps, { kind: "edit", text: event.text, ok: event.ok }] };
    case "reply":
      return { ...turn, reply: event.text };
    case "questions":
      return { ...turn, questions: event.questions };
    case "error":
      return { ...turn, status: "error", error: event.message };
    case "done":
      return { ...turn, activity: null, status: turn.status === "running" ? "done" : turn.status };
    case "agent":
      return turn; // handled by the caller
  }
}

/**
 * The copilot conversation for the agent being edited. The browser keeps the
 * history (the backend is stateless) and sends it, plus the current working
 * copy, with every prompt. Mount per agent: AgentEditor's `key` resets it.
 */
export function useCopilot({ getAgent, onAgent, onTurnEnd }: UseCopilotOptions) {
  const [turns, setTurns] = useState<CopilotTurn[]>([]);
  const turnsRef = useRef(turns);
  useEffect(() => {
    turnsRef.current = turns;
  });
  const abortRef = useRef<AbortController | null>(null);
  const running = turns.at(-1)?.status === "running";

  // Hang up on unmount (e.g. navigating to another agent mid-turn).
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateLast = useCallback((fn: (turn: CopilotTurn) => CopilotTurn) => {
    setTurns((all) => {
      const last = all.at(-1);
      return last ? [...all.slice(0, -1), fn(last)] : all;
    });
  }, []);

  const send = useCallback(
    async (prompt: string, fix?: CopilotFix) => {
      const text = prompt.trim();
      if (!text || abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      const messages = [...historyOf(turnsRef.current), { role: "user" as const, content: text }];
      setTurns((all) => [
        ...all,
        {
          id: all.length + 1,
          prompt: text,
          ...(fix && { fix }),
          status: "running",
          activity: "Sending…",
          steps: [],
        },
      ]);

      let changed = false;
      try {
        await streamCopilotTurn(
          { agent: agentDocument(getAgent()), messages, ...(fix && { fix }) },
          (event) => {
            if (event.type === "agent") {
              changed = true;
              onAgent(normalizeAgent(event.agent as WireAgentDocument));
            } else {
              updateLast((turn) => applyEvent(turn, event));
            }
          },
          controller.signal,
        );
      } catch (error) {
        updateLast((turn) =>
          controller.signal.aborted
            ? { ...turn, status: "stopped", activity: null }
            : { ...turn, status: "error", activity: null, error: errorMessage(error) },
        );
      } finally {
        abortRef.current = null;
        // A stream that ended without "done" (connection dropped) still finishes the turn.
        updateLast((turn) =>
          turn.status === "running" ? { ...turn, status: "done", activity: null } : turn,
        );
        onTurnEnd?.(changed);
      }
    },
    [getAgent, onAgent, onTurnEnd, updateLast],
  );

  /** Start a fix turn for a call-analysis finding (ignored while a turn runs, like `send`). */
  const fix = useCallback((finding: CopilotFix) => send(fixPrompt(finding), finding), [send]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { turns, running, send, fix, stop };
}
