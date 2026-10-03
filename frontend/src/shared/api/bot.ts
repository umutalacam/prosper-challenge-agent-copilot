import type { BotStatus } from "@/shared/types/bot";
import { request } from "./http";

export const botApi = {
  status: () => request<BotStatus>("/bot"),

  /** New calls get `agentId`; calls in progress keep theirs. 404 if it doesn't exist. */
  deploy: (agentId: string) =>
    request<BotStatus>("/bot", { method: "PUT", body: JSON.stringify({ agent_id: agentId }) }),
};
