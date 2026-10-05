import type { CallDetail, CallOutcome, CallSummary } from "@/shared/types/call";
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
};
