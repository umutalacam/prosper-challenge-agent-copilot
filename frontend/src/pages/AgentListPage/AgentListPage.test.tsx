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

/** A fake backend: GET /api/agents, GET/PUT /api/bot (PUT pins the agent's saved version). */
function stubApi(initial: BotStatus) {
  let bot = initial;
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/agents") return Promise.resolve(Response.json(agents));
    if (url === "/api/bot" && init?.method === "PUT") {
      const { agent_id } = JSON.parse(init.body as string) as { agent_id: string };
      const version = agents.find((agent) => agent.id === agent_id)?.version ?? null;
      bot = { ...bot, agent_id, version, deployed_at: "2026-10-05T12:00:00Z" };
    }
    return Promise.resolve(Response.json(bot));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const deployedFrontDesk = (version: number): BotStatus => ({
  agent_id: "front-desk",
  version,
  deployed_at: "2026-10-05T09:00:00Z",
  active_calls: 1,
  client_url: "http://localhost:7860/client/",
});

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
  it("badges the deployed agent and its version", async () => {
    stubApi(deployedFrontDesk(2)); // Front Desk's latest save is v2
    renderPage();

    const frontDesk = await screen.findByRole("row", { name: /Front Desk/ });
    expect(await within(frontDesk).findByText("● Deployed v2")).toBeTruthy();
    expect(within(frontDesk).getByRole("link", { name: /Talk to it/ })).toBeTruthy();
    expect(within(frontDesk).queryByRole("button", { name: /Deploy/ })).toBeNull();
    expect(within(row("Billing")).getByText("Not deployed")).toBeTruthy();
    expect(screen.getByText("1 call live")).toBeTruthy();
    expect(screen.getByText(/Answering with/).textContent).toBe("Answering with Front Desk v2");
  });

  it("offers a redeploy when newer saves aren't live", async () => {
    stubApi(deployedFrontDesk(1)); // deployed v1, saved v2 since
    const user = userEvent.setup();
    renderPage();

    const frontDesk = await screen.findByRole("row", { name: /Front Desk/ });
    expect(await within(frontDesk).findByText("● Deployed v1")).toBeTruthy();
    expect(within(frontDesk).getByText("v2 saved")).toBeTruthy();

    await user.click(within(frontDesk).getByRole("button", { name: "Redeploy Front Desk" }));
    expect(await within(row("Front Desk")).findByText("● Deployed v2")).toBeTruthy();
    expect(within(row("Front Desk")).queryByText("v2 saved")).toBeNull();
  });

  it("deploys an agent and moves the badge to it", async () => {
    const fetchMock = stubApi(deployedFrontDesk(2));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Deploy Billing" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bot",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ agent_id: "billing" }) }),
    );
    expect(await within(row("Billing")).findByText("● Deployed v1")).toBeTruthy();
    expect(
      within(row("Front Desk")).getByRole("button", { name: "Deploy Front Desk" }),
    ).toBeTruthy();
  });

  it("says when no agent is deployed", async () => {
    stubApi({
      agent_id: null,
      version: null,
      deployed_at: null,
      active_calls: 0,
      client_url: "/client/",
    });
    renderPage();

    expect(await screen.findByText(/No agent deployed — deploy one/)).toBeTruthy();
    expect(await screen.findAllByRole("button", { name: /^Deploy / })).toHaveLength(2);
  });
});
