import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallDetail, CallIssue, CallSummary } from "@/shared/types/call";
import { CallLogPane } from "./CallLogPane";

const stuckIn = (node: string, kind: CallIssue["kind"] = "stuck"): CallIssue => ({
  kind,
  node,
  step: 0,
  at_ms: 9_000,
  replies: 3,
  message: null,
});

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const finished: CallSummary = {
  id: "c-done",
  agent_version: 3,
  started_at: minutesAgo(34),
  duration_ms: 125_000,
  outcome: "completed",
  end_node: "confirm",
  path: ["greeting", "confirm"],
  issues: [],
};

const broken: CallSummary = {
  id: "c-broken",
  agent_version: 3,
  started_at: minutesAgo(5),
  duration_ms: 42_000,
  outcome: "error",
  end_node: "greeting",
  path: ["greeting"],
  issues: [stuckIn("greeting")],
};

const detail: CallDetail = {
  ...finished,
  agent_id: "desk",
  agent_name: "Desk",
  ended_at: finished.started_at,
  issues: [stuckIn("greeting", "long_stay")],
  steps: [
    {
      node: "greeting",
      entered_ms: 0,
      stay_ms: 4_000,
      replies: 3,
      exit: { function: "record_caller", args: { name: "Ana" } },
      ending: null,
    },
    {
      node: "confirm",
      entered_ms: 4_000,
      stay_ms: 121_000,
      replies: 1,
      exit: null,
      ending: "completed",
    },
  ],
  transcript: [
    { speaker: "bot", node: "greeting", text: "Hi, who's calling?", at_ms: 300 },
    { speaker: "caller", node: "greeting", text: "Ana.", at_ms: 1200 },
    { speaker: "bot", node: "confirm", text: "You're booked.", at_ms: 5000, interrupted: true },
  ],
  final_state: { name: "Ana" },
  events: [],
};

/** A fake calls API; `calls` answers the list, filtered by any `outcome` params. */
function stubApi(calls: CallSummary[] | "fail") {
  const fetchMock = vi.fn((url: string) => {
    const { pathname, searchParams } = new URL(url, "http://localhost");
    if (calls === "fail") {
      return Promise.resolve(Response.json({ detail: "Database is down" }, { status: 500 }));
    }
    if (pathname === "/api/agents/desk/calls") {
      const outcomes = searchParams.getAll("outcome");
      return Promise.resolve(
        Response.json(outcomes.length ? calls.filter((c) => outcomes.includes(c.outcome)) : calls),
      );
    }
    if (pathname === "/api/agents/desk/calls/c-done") return Promise.resolve(Response.json(detail));
    return Promise.resolve(Response.json({ detail: "Not found" }, { status: 404 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPane() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CallLogPane agentId="desk" onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CallLogPane", () => {
  it("lists the agent's calls with outcome, duration and how long ago", async () => {
    stubApi([broken, finished]);
    renderPane();

    expect(screen.getByRole("heading", { name: "Call Log" })).toBeTruthy();
    const rows = await within(await screen.findByRole("list", { name: "Calls" })).findAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(2);
    const [first, second] = rows as [HTMLElement, HTMLElement];
    expect(first.textContent).toContain("Error");
    expect(first.textContent).toContain("Stuck in greeting");
    expect(first.textContent).toContain("0:42");
    expect(first.textContent).toContain("5 minutes ago");
    expect(second.textContent).toContain("Completed");
    expect(second.textContent).toContain("2:05");
    expect(second.textContent).toContain("34 minutes ago");
  });

  it("filters by outcome on the server", async () => {
    const fetchMock = stubApi([broken, finished]);
    const user = renderPane();
    await screen.findByRole("list", { name: "Calls" });

    await user.click(screen.getByRole("button", { name: "Completed" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents/desk/calls?outcome=completed",
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: "Completed" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await vi.waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
    });
  });

  it("opens a call's overview, then its transcript, and steps back out", async () => {
    stubApi([finished]);
    const user = renderPane();

    const list = await screen.findByRole("list", { name: "Calls" });
    await user.click(within(list).getByRole("button"));

    // The overview: path, what was collected, and no transcript yet.
    const path = await screen.findByRole("list", { name: "Path through the agent" });
    const steps = within(path).getAllByRole("listitem");
    expect(steps.map((step) => step.querySelector("span + div span")?.textContent)).toEqual([
      "greeting",
      "confirm",
    ]);
    expect(steps[0]?.textContent).toContain("name: Ana");
    expect(steps[0]?.textContent).toContain("Long stay");
    expect(steps[1]?.textContent).toContain("Call completed");
    expect(screen.queryByText("Worth a look")).toBeNull(); // a long stay isn't a failure
    expect(screen.queryByRole("list", { name: "Transcript" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "View transcript (3 messages)" }));
    const transcript = screen.getByRole("list", { name: "Transcript" });
    expect(transcript.textContent).toContain("Hi, who's calling?");
    expect(transcript.textContent).toContain("Ana.");
    expect(transcript.textContent).toContain("You're booked. — interrupted");

    await user.click(screen.getByRole("button", { name: "Overview" }));
    await user.click(screen.getByRole("button", { name: "All calls" }));
    expect(await screen.findByRole("list", { name: "Calls" })).toBeTruthy();
  });

  it("flags a call as stuck only if it ended stuck", async () => {
    const longButFine = { ...finished, issues: [stuckIn("greeting", "long_stay")] };
    stubApi([broken, longButFine]);
    renderPane();
    const [first, second] = (await within(
      await screen.findByRole("list", { name: "Calls" }),
    ).findAllByRole("listitem")) as [HTMLElement, HTMLElement];
    expect(first.textContent).toContain("Stuck in greeting"); // errored there
    expect(second.textContent).not.toContain("Stuck"); // completed: just a long stay
  });

  it("says when there are no calls", async () => {
    stubApi([]);
    renderPane();
    expect(await screen.findByText("No calls yet")).toBeTruthy();
  });

  it("reports a failure to load", async () => {
    stubApi("fail");
    renderPane();
    expect(await screen.findByText("Couldn't load calls")).toBeTruthy();
    expect(screen.getByText("Database is down")).toBeTruthy();
  });
});
