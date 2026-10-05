import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentIssues, CallDetail } from "@/shared/types/call";
import { callerName } from "../../lib/callerName";
import { IssuesPane } from "./IssuesPane";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const issues: AgentIssues = {
  seen_at: null,
  new_count: 3,
  versions: [
    {
      version: 3,
      call_count: 12,
      calls_with_issues: 3,
      groups: [
        {
          kind: "stuck",
          node: "greeting",
          call_count: 2,
          new_count: 2,
          last_at: minutesAgo(5),
          calls: [
            { id: "c-a", ended_at: minutesAgo(5) },
            { id: "c-b", ended_at: minutesAgo(40) },
          ],
        },
        {
          kind: "long_stay",
          node: "collect",
          call_count: 1,
          new_count: 1,
          last_at: minutesAgo(9),
          calls: [{ id: "c-c", ended_at: minutesAgo(9) }],
        },
      ],
      flags: [
        { call_id: "c-d", reason: "It booked the wrong day", created_at: minutesAgo(2), new: true },
      ],
    },
    { version: 2, call_count: 4, calls_with_issues: 0, groups: [], flags: [] },
  ],
};

const seen: AgentIssues = {
  ...issues,
  seen_at: new Date().toISOString(),
  new_count: 0,
  versions: issues.versions.map((v) => ({
    ...v,
    groups: v.groups.map((g) => ({ ...g, new_count: 0 })),
    flags: v.flags.map((f) => ({ ...f, new: false })),
  })),
};

const call: CallDetail = {
  id: "c-a",
  agent_id: "desk",
  agent_name: "Desk",
  agent_version: 3,
  started_at: minutesAgo(6),
  ended_at: minutesAgo(5),
  duration_ms: 60_000,
  outcome: "abandoned",
  end_node: "greeting",
  path: ["greeting"],
  issues: [],
  flag_count: 0,
  steps: [],
  analysis: null,
  flags: [],
  transcript: [],
  final_state: {},
  events: [],
};

/** A fake API: the issues (seen once PATCHed), the deployed agent, one call. */
function stubApi() {
  let current = issues;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/agents/desk/issues" && init?.method === "PATCH") {
      current = seen;
      return Promise.resolve(Response.json(current));
    }
    if (url === "/api/agents/desk/issues") return Promise.resolve(Response.json(current));
    if (url === "/api/bot") {
      return Promise.resolve(
        Response.json({
          agent_id: "desk",
          version: 3,
          deployed_at: null,
          active_calls: 0,
          client_url: "/",
        }),
      );
    }
    if (url === "/api/agents/desk/calls/c-a") return Promise.resolve(Response.json(call));
    return Promise.resolve(Response.json({ detail: "Not found" }, { status: 404 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPane() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <IssuesPane agentId="desk" onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const patches = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IssuesPane", () => {
  it("lists issues by version: failures, flags, then long stays", async () => {
    stubApi();
    renderPane();

    const v3 = (await screen.findByRole("heading", { name: "v3" })).closest("section")!;
    expect(await within(v3).findByText("● Deployed")).toBeTruthy();
    expect(v3.textContent).toContain("12 calls · 3 with issues");
    // The version's own rows (a group's calls are nested lists inside its row).
    const rows = [...v3.querySelector("ul")!.children] as HTMLElement[];
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Stuck in greeting"),
      expect.stringContaining("It booked the wrong day"),
      expect.stringContaining("Long stays in collect"),
    ]);
    expect(rows[0]?.textContent).toContain("2 new");
    expect(rows[1]?.textContent).toContain("New");
    expect(rows[2]?.textContent).not.toContain("new"); // long stays never count as new

    const v2 = screen.getByRole("heading", { name: "v2" }).closest("section")!;
    expect(v2.textContent).toContain("No issues in these calls.");
  });

  it("marks the issues seen once, and keeps what was new highlighted", async () => {
    const fetchMock = stubApi();
    renderPane();

    await vi.waitFor(() => {
      expect(patches(fetchMock)).toHaveLength(1);
    });
    expect(patches(fetchMock)[0]?.[1]?.body).toBe(JSON.stringify({ seen: true }));
    await vi.waitFor(() => {
      expect(screen.getByText("2 new")).toBeTruthy(); // still highlighted after the PATCH
    });
    expect(patches(fetchMock)).toHaveLength(1);
  });

  it("opens a call from a group and comes back", async () => {
    stubApi();
    const user = renderPane();

    await user.click(await screen.findByText("Stuck in greeting"));
    await user.click(screen.getByRole("button", { name: new RegExp(callerName("c-a")) }));
    expect(await screen.findByText("The flow never started.")).toBeTruthy(); // the call's overview
    await user.click(screen.getByRole("button", { name: "All issues" }));
    expect(await screen.findByRole("heading", { name: "v3" })).toBeTruthy();
  });
});
