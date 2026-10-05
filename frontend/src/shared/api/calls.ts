import type {
  AgentIssues,
  CallDetail,
  CallFlag,
  CallOutcome,
  CallSummary,
} from "@/shared/types/call";
import { request } from "./http";

export interface CallListOptions {
  /** Only calls that ended one of these ways; empty or omitted for all. */
  outcomes?: readonly CallOutcome[];
  /** At most this many (the API allows 1–200, default 50). */
  limit?: number;
}

const callsPath = (agentId: string) => `/agents/${encodeURIComponent(agentId)}/calls`;

export const callsApi = {
  /** An agent's recent calls, newest first. 404 if the agent doesn't exist. */
  list: (agentId: string, { outcomes = [], limit }: CallListOptions = {}) => {
    const query = new URLSearchParams();
    for (const outcome of outcomes) query.append("outcome", outcome);
    if (limit !== undefined) query.set("limit", String(limit));
    const search = query.toString();
    return request<CallSummary[]>(`${callsPath(agentId)}${search ? `?${search}` : ""}`);
  },

  /** One of the agent's calls in full: transcript, timeline, final state. */
  get: (agentId: string, callId: string) =>
    request<CallDetail>(`${callsPath(agentId)}/${encodeURIComponent(callId)}`),

  /** The agent's issues across its calls, by version, and how many are new. */
  issues: (agentId: string) =>
    request<AgentIssues>(`/agents/${encodeURIComponent(agentId)}/issues`),

  /** Mark the agent's issues seen now (only what happens after is new); returns them updated. */
  markIssuesSeen: (agentId: string) =>
    request<AgentIssues>(`/agents/${encodeURIComponent(agentId)}/issues`, {
      method: "PATCH",
      body: JSON.stringify({ seen: true }),
    }),

  /** Flag a call: a customer says something went wrong. Its AI analysis reruns in the background. */
  flag: (agentId: string, callId: string, reason: string) =>
    request<CallFlag>(`${callsPath(agentId)}/${encodeURIComponent(callId)}/flags`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
