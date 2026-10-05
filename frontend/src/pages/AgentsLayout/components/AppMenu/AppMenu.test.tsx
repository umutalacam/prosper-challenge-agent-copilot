import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSummary } from "@/shared/types/agent";
import { AppMenu } from "./AppMenu";

const agent = (id: string, updated_at: string): AgentSummary => ({
  id,
  name: id.toUpperCase(),
  node_count: 1,
  version: 1,
  updated_at,
});

const agents = [
  agent("old", "2026-10-01T00:00:00Z"),
  agent("newest", "2026-10-03T00:00:00Z"),
  agent("middle", "2026-10-02T00:00:00Z"),
];

function stubApi() {
  let bot = {
    agent_id: "middle",
    version: 1,
    deployed_at: "2026-10-05T09:00:00Z",
    active_calls: 0,
    client_url: "http://localhost:7860/client/",
  };
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/agents") return Promise.resolve(Response.json(agents));
    if (init?.method === "PUT") {
      const { agent_id } = JSON.parse(init.body as string) as { agent_id: string };
      if (agent_id === "missing") {
        return Promise.resolve(
          Response.json({ detail: "Agent 'missing' not found." }, { status: 404 }),
        );
      }
      bot = { ...bot, agent_id };
    }
    return Promise.resolve(Response.json(bot));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    // Like app/router.tsx: the static /agents/new route wins, so it has no agentId.
    [
      { path: "/agents/new", element: <AppMenu /> },
      { path: "/agents/:agentId", element: <AppMenu /> },
    ],
    { initialEntries: [path] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), router };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppMenu", () => {
  it("opens from the hamburger with recent agents, newest first", async () => {
    stubApi();
    const { user } = renderAt("/agents/old");
    await user.click(screen.getByRole("button", { name: "Menu" }));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Back to agents/ })).toBeTruthy();
    const recent = await within(menu).findAllByRole("menuitem", { name: /NEWEST|MIDDLE|OLD/ });
    expect(recent.map((item) => item.textContent)).toEqual(["NEWEST", "MIDDLEDeployed", "OLD"]);
    expect(within(menu).getByRole("menuitem", { name: "OLD" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("closes on Escape and returns focus to the button", async () => {
    stubApi();
    const { user } = renderAt("/agents/old");
    const button = screen.getByRole("button", { name: "Menu" });
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("test call deploys the open agent and opens the voice client", async () => {
    const fetchMock = stubApi();
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.stubGlobal(
      "open",
      vi.fn(() => tab),
    );
    const { user } = renderAt("/agents/old");

    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("menuitem", { name: /Test call/ }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bot",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ agent_id: "old" }) }),
    );
    await vi.waitFor(() => {
      expect(tab.location.href).toBe("http://localhost:7860/client/");
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("test call shows the error and closes the blank tab when the deploy fails", async () => {
    stubApi();
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.stubGlobal(
      "open",
      vi.fn(() => tab),
    );
    const { user } = renderAt("/agents/missing");

    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("menuitem", { name: /Test call/ }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Couldn't start the call: Agent 'missing' not found.",
    );
    expect(tab.close).toHaveBeenCalled();
  });

  it("can't test an unsaved agent", async () => {
    stubApi();
    const { user } = renderAt("/agents/new");
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menuitem", { name: /Test call/ })).toHaveProperty("disabled", true);
  });
});
