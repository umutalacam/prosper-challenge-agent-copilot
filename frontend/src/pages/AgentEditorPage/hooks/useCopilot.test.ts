import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@/shared/types/agent";
import type { CopilotEvent } from "@/shared/types/copilot";
import { carriedTurns, useCopilot, type CopilotTurn } from "./useCopilot";

const agent: Agent = {
  name: "Desk",
  persona: "",
  initial_node: "greeting",
  nodes: [{ name: "greeting", task_messages: [], edges: [] }],
};

/** fetch that streams `events` as NDJSON, split mid-line to exercise buffering. */
function streamResponse(events: CopilotEvent[]) {
  const text = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const cut = Math.floor(text.length / 2);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(text.slice(0, cut)));
      controller.enqueue(encoder.encode(text.slice(cut)));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
}

/** The JSON body of the n-th fetch call. */
function requestBody(fetchMock: { mock: { calls: unknown[][] } }, n: number): string {
  const init = fetchMock.mock.calls[n]?.[1] as RequestInit | undefined;
  return init?.body as string;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCopilot", () => {
  it("streams a turn: steps, live agent updates, reply and questions", async () => {
    const edited = { ...agent, name: "Dental desk" };
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse([
          { type: "activity", text: "Thinking…" },
          { type: "step", text: "Updated the agent's name", ok: true },
          { type: "agent", agent: edited },
          { type: "step", text: "delete_node refused: start node", ok: false },
          { type: "reply", text: "Renamed it." },
          { type: "questions", questions: [{ question: "Who calls?", options: ["Patients"] }] },
          { type: "done" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onAgent = vi.fn();
    const onTurnEnd = vi.fn();
    const { result } = renderHook(() => useCopilot({ getAgent: () => agent, onAgent, onTurnEnd }));

    await act(() => result.current.send("Make it a dental desk"));

    const turn = result.current.turns[0]!;
    expect(turn).toMatchObject({
      prompt: "Make it a dental desk",
      status: "done",
      activity: null,
      reply: "Renamed it.",
      questions: [{ question: "Who calls?", options: ["Patients"] }],
      steps: [
        { kind: "edit", text: "Updated the agent's name", ok: true },
        { kind: "edit", text: "delete_node refused: start node", ok: false },
      ],
    });
    expect(onAgent).toHaveBeenCalledWith(expect.objectContaining({ name: "Dental desk" }));
    expect(onTurnEnd).toHaveBeenCalledWith(true);

    const sent = JSON.parse(requestBody(fetchMock, 0)) as { messages: unknown[] };
    expect(sent.messages).toEqual([{ role: "user", content: "Make it a dental desk" }]);
  });

  it("starts a fix turn: sends the finding and keeps it on the turn", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(streamResponse([{ type: "reply", text: "Fixed." }, { type: "done" }])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCopilot({ getAgent: () => agent, onAgent: vi.fn() }));
    const finding = {
      call_id: "c1",
      node: "greeting",
      step: 0,
      cause: "No action for insurance questions.",
      suggestion: "Add one.",
    };

    await act(() => result.current.fix(finding));

    // Only a label: the finding goes once, as `fix`, and the backend words it for the model.
    const prompt = 'Fix the problem a call ran into in "greeting".';
    expect(result.current.turns[0]).toMatchObject({ prompt, fix: finding, reply: "Fixed." });
    const sent = JSON.parse(requestBody(fetchMock, 0)) as { messages: unknown[]; fix: unknown };
    expect(sent.fix).toEqual(finding);
    expect(sent.messages).toEqual([{ role: "user", content: prompt }]);
  });

  it("talks a group fix over until it's agreed, then sends plain prompts again", async () => {
    const replies: CopilotEvent[][] = [
      [
        { type: "note", text: "Common cause: greeting only handles bookings." },
        { type: "reply", text: "I'd suggest: Add an action. Want me to apply it?" },
        { type: "proposal", suggestion: "Add an action." },
        { type: "done" },
      ],
      [
        { type: "reply", text: "Good idea: with a handoff. Apply it?" },
        { type: "proposal", suggestion: "Add an action with a handoff." },
        { type: "done" },
      ],
      [
        { type: "note", text: "Goal: Apply the fix…" },
        { type: "reply", text: "Done." },
        { type: "done" },
      ],
      [{ type: "reply", text: "Hi." }, { type: "done" }],
    ];
    const fetchMock = vi.fn(() => Promise.resolve(streamResponse(replies.shift() ?? [])));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCopilot({ getAgent: () => agent, onAgent: vi.fn() }));
    const group = {
      kind: "stuck" as const,
      node: "greeting",
      version: 4,
      call_count: 3,
      causes: ["No action for insurance questions."],
    };
    const sent = (n: number) =>
      JSON.parse(requestBody(fetchMock, n)) as {
        messages: { content: string }[];
        group_fix?: unknown;
      };

    await act(() => result.current.fixGroup(group));
    const prompt = 'Fix "Stuck in greeting" across 3 calls (v4).';
    expect(result.current.turns[0]).toMatchObject({
      prompt,
      group_fix: group,
      proposal: "Add an action.",
    });
    expect(sent(0).group_fix).toEqual(group);
    expect(sent(0).messages).toEqual([{ role: "user", content: prompt }]);

    // A reply talks it over: it goes back with the proposal.
    await act(() => result.current.send("What about a handoff?"));
    expect(sent(1).group_fix).toEqual({ ...group, proposal: "Add an action." });
    expect(result.current.turns[1]?.proposal).toBe("Add an action with a handoff.");

    // Agreeing builds it, with the revised proposal; no proposal comes back.
    await act(() => result.current.send("Yes, go ahead"));
    expect(sent(2).group_fix).toEqual({ ...group, proposal: "Add an action with a handoff." });
    expect(result.current.turns[2]?.proposal).toBeUndefined();

    // The conversation is closed: the next prompt is an ordinary one.
    await act(() => result.current.send("Hello"));
    expect(sent(3).group_fix).toBeUndefined();
  });

  it("sends earlier turns, questions included, as history", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse([
          { type: "questions", questions: [{ question: "Who calls?" }] },
          { type: "done" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCopilot({ getAgent: () => agent, onAgent: vi.fn() }));
    await act(() => result.current.send("Build a desk"));
    await act(() => result.current.send("Patients"));

    const second = JSON.parse(requestBody(fetchMock, 1)) as {
      messages: { role: string; content: string }[];
    };
    expect(second.messages).toEqual([
      { role: "user", content: "Build a desk" },
      { role: "assistant", content: "I asked:\n- Who calls?" },
      { role: "user", content: "Patients" },
    ]);
  });

  it("reports a failed request on the turn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ detail: "Bad input" }, { status: 422 }))),
    );
    const { result } = renderHook(() => useCopilot({ getAgent: () => agent, onAgent: vi.fn() }));
    await act(() => result.current.send("Hi"));
    await waitFor(() => {
      expect(result.current.turns[0]).toMatchObject({ status: "error", error: "Bad input" });
    });
  });

  it("starts from a conversation carried over a remount (the first save of a new agent)", async () => {
    const before: CopilotTurn[] = [
      {
        id: 1,
        prompt: "Build a dental desk",
        status: "done",
        activity: null,
        steps: [],
        reply: "Built it.",
      },
    ];
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        streamResponse([{ type: "reply", text: "Friendlier now." }, { type: "done" }]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useCopilot({ getAgent: () => agent, onAgent: vi.fn(), initialTurns: before }),
    );
    expect(result.current.turns).toEqual(before);

    await act(() => result.current.send("Make it friendlier"));
    const sent = JSON.parse(requestBody(fetchMock, 0)) as { messages: unknown[] };
    expect(sent.messages).toEqual([
      { role: "user", content: "Build a dental desk" },
      { role: "assistant", content: "Built it." },
      { role: "user", content: "Make it friendlier" },
    ]);
  });
});

describe("carriedTurns", () => {
  it("reads the carried conversation, a turn cut off mid-run as stopped", () => {
    const running: CopilotTurn = {
      id: 2,
      prompt: "x",
      status: "running",
      activity: "Planning…",
      steps: [],
    };
    expect(carriedTurns({ copilotTurns: [running] })).toEqual([
      { ...running, status: "stopped", activity: null },
    ]);
    expect(carriedTurns(null)).toBeUndefined();
    expect(carriedTurns({ copilotTurns: [] })).toBeUndefined();
    expect(carriedTurns({ prompt: "unrelated state" })).toBeUndefined();
  });
});
