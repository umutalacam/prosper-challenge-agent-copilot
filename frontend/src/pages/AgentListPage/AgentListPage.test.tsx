import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSummary } from "@/shared/types/agent";
import type { BotStatus } from "@/shared/types/bot";
import { AgentListPage } from "./AgentListPage";

const agents: AgentSummary[] = [
  {
    id: "front-desk",
    name: "Front Desk",
    node_count: 4,
    version: 2,
    updated_at: "2026-10-03T10:00:00Z",
  },
  { id: "billing", name: "Billing", node_count: 2, version: 1, updated_at: "2026-10-03T11:00:00Z" },
];

/** A fake backend: GET /api/agents, GET/PUT /api/bot. */
function stubApi(initial: BotStatus) {
  let bot = initial;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/agents") return Promise.resolve(Response.json(agents));
    if (url === "/api/bot" && init?.method === "PUT") {
      const { agent_id } = JSON.parse(init.body as string) as { agent_id: string };
      bot = { ...bot, agent_id };
    }
    return Promise.resolve(Response.json(bot));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AgentListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgentListPage", () => {
  it("badges the agent the bot is running", async () => {
    stubApi({
      agent_id: "front-desk",
      active_calls: 1,
      client_url: "http://localhost:7860/client/",
    });
    renderPage();

    expect(
      await within(await screen.findByRole("row", { name: /Front Desk/ })).findByText(/Running/),
    ).toBeTruthy();
    expect(within(row("Billing")).queryByText(/Running/)).toBeNull();
    expect(screen.getByText("1 call live")).toBeTruthy();
    expect(within(row("Front Desk")).getByRole("link", { name: /Talk to it/ })).toBeTruthy();
  });

  it("deploys an agent and moves the badge to it", async () => {
    const fetchMock = stubApi({ agent_id: "front-desk", active_calls: 0, client_url: "/client/" });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Deploy Billing" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bot",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ agent_id: "billing" }) }),
    );
    expect(await within(row("Billing")).findByText(/Running/)).toBeTruthy();
    expect(
      within(row("Front Desk")).getByRole("button", { name: "Deploy Front Desk" }),
    ).toBeTruthy();
  });

  it("says when no agent is deployed", async () => {
    stubApi({ agent_id: null, active_calls: 0, client_url: "/client/" });
    renderPage();

    expect(await screen.findByText(/No agent deployed/)).toBeTruthy();
    expect(await screen.findAllByRole("button", { name: /^Deploy / })).toHaveLength(2);
  });
});
