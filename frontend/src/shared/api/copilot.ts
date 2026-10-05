import type { CopilotEvent, CopilotFix, CopilotMessage } from "@/shared/types/copilot";
import { apiFetch } from "./http";

export interface CopilotTurnInput {
  /** The editor's working copy, without server metadata. */
  agent: object;
  /** The conversation so far, ending with the new prompt (for a fix, the finding as text). */
  messages: CopilotMessage[];
  /** A fix turn: the call-analysis finding to fix. */
  fix?: CopilotFix;
}

/** Split streamed NDJSON text into complete events; `rest` is a partial last line. */
export function parseNdjson(buffer: string): { events: CopilotEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events = lines
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as CopilotEvent);
  return { events, rest };
}

/**
 * Run one copilot turn, calling `onEvent` for each event as it streams in.
 * Resolves when the stream ends; abort `signal` to stop the turn.
 */
export async function streamCopilotTurn(
  input: CopilotTurnInput,
  onEvent: (event: CopilotEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await apiFetch("/copilot/turns", {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
  if (!res.body) throw new Error("The copilot sent no response.");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const { events, rest } = parseNdjson(buffer + value);
    buffer = rest;
    events.forEach(onEvent);
  }
  parseNdjson(buffer + "\n").events.forEach(onEvent);
}
