import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSummary, NewAgentState } from "@/shared/types/agent";
import type { BotStatus } from "@/shared/types/bot";
import { AgentListPage } from "./AgentListPage";

const agents: AgentSummary[] = [
  {
    id: "front-desk",
    name: "Front Desk",
    node_count: 4,
    version: 2,
    updated_at: "2026-10-03T10:00:00Z",
    call_count: 1284,
    last_call_at: "2026-10-04T10:00:00Z",
  },
  {
    id: "billing",
    name: "Billing",
    node_count: 2,
    version: 1,
    updated_at: "2026-10-03T11:00:00Z",
    call_count: 0,
    last_call_at: null,
  },
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

/** Where the prompt box navigates: shows the prompt it was handed. */
function NewAgentProbe() {
  const state = useLocation().state as NewAgentState | null;
  return <p>New agent: {state?.prompt}</p>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Routes>
          <Route index element={<AgentListPage />} />
          <Route path="agents/new" element={<NewAgentProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const row = (name: string) =>
  within(screen.getByRole("list", { name: "Agents" }))
    .getAllByRole("listitem")
    .find((item) => item.textContent.includes(name))!;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgentListPage", () => {
  it("puts the logo first, above the pitch and the prompt box", async () => {
    stubApi(deployedFrontDesk(2));
    renderPage();
    const logo = screen.getByRole("img", { name: "Prosper" });
    const title = screen.getByRole("heading", { level: 1 });
    expect(logo.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Describe your voice agent" })).toBeTruthy();
    await screen.findByRole("list", { name: "Agents" });
  });

  it("starts a new agent with the prompt", async () => {
    stubApi(deployedFrontDesk(2));
    const user = renderPage();
    const build = screen.getByRole("button", { name: "Build agent" });
    expect((build as HTMLButtonElement).disabled).toBe(true);

    await user.type(
      screen.getByRole("textbox", { name: "Describe your voice agent" }),
      "A dental receptionist{Enter}",
    );
    expect(await screen.findByText("New agent: A dental receptionist")).toBeTruthy();
  });

  it("fills the prompt box from a suggestion", async () => {
    stubApi(deployedFrontDesk(2));
    const user = renderPage();
    const suggestions = within(screen.getByRole("list", { name: "Suggestions" })).getAllByRole(
      "button",
    );
    await user.click(suggestions[0]!);
    const input = screen.getByRole("textbox", { name: "Describe your voice agent" });
    expect((input as HTMLTextAreaElement).value).toBe(suggestions[0]!.getAttribute("title"));
    expect((input as HTMLTextAreaElement).value).toMatch(/dental clinic/);
    expect(document.activeElement).toBe(input);
  });

  it("shows each agent's status and calls, and the live agent", async () => {
    stubApi(deployedFrontDesk(2)); // Front Desk's latest save is v2
    renderPage();

    await screen.findByRole("list", { name: "Agents" });
    const frontDesk = row("Front Desk");
    expect(await within(frontDesk).findByText("● Deployed v2")).toBeTruthy();
    expect(within(frontDesk).getByText("1,284").parentElement?.textContent).toBe("1,284 calls");
    expect(within(frontDesk).queryByRole("button", { name: /Deploy/ })).toBeNull();
    expect(within(frontDesk).getByRole("link", { name: "Front Desk" }).getAttribute("href")).toBe(
      "/agents/front-desk",
    );
    expect(within(row("Billing")).getByText("Not deployed")).toBeTruthy();
    expect(within(row("Billing")).getByText("no calls yet")).toBeTruthy();
    expect(screen.getByText(/Answering calls with/).textContent).toBe(
      "Answering calls with Front Desk v2 · 1 call live",
    );
  });

  it("offers a redeploy when newer saves aren't live", async () => {
    stubApi(deployedFrontDesk(1)); // deployed v1, saved v2 since
    const user = renderPage();

    await screen.findByRole("list", { name: "Agents" });
    expect(await within(row("Front Desk")).findByText("● Deployed v1")).toBeTruthy();
    expect(within(row("Front Desk")).getByText("v2 saved")).toBeTruthy();

    await user.click(
      within(row("Front Desk")).getByRole("button", { name: "Redeploy Front Desk" }),
    );
    expect(await within(row("Front Desk")).findByText("● Deployed v2")).toBeTruthy();
    expect(within(row("Front Desk")).queryByText("v2 saved")).toBeNull();
  });

  it("deploys an agent and moves the badge to it", async () => {
    const fetchMock = stubApi(deployedFrontDesk(2));
    const user = renderPage();

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
