import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, StoredAgent } from "@/shared/types/agent";
import { agentsApi } from "./agents";
import type { CallOutcome } from "@/shared/types/call";
import { botApi } from "./bot";
import { callsApi } from "./calls";
import { ApiError } from "./http";

/** Query keys, structured so `agentKeys.all` invalidates every agent query. */
export const agentKeys = {
  all: ["agents"] as const,
  list: () => [...agentKeys.all, "list"] as const,
  detail: (id: string) => [...agentKeys.all, "detail", id] as const,
};

export function useAgentList() {
  return useQuery({ queryKey: agentKeys.list(), queryFn: agentsApi.list });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => agentsApi.get(id),
    // A missing agent won't appear by retrying.
    retry: (count, error) => !(error instanceof ApiError && error.isNotFound) && count < 2,
  });
}

/** A new agent (`id: null`), or an update to the stored `version` of agent `id`. */
export type SaveAgentInput =
  { id: null; agent: Agent; version?: undefined } | { id: string; agent: Agent; version: number };

/** Create or update an agent; keeps the list and detail caches in sync. */
export function useSaveAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, agent, version }: SaveAgentInput) =>
      id === null ? agentsApi.create(agent) : agentsApi.update(id, agent, version),
    onSuccess: (saved: StoredAgent) => {
      queryClient.setQueryData(agentKeys.detail(saved.id), saved);
      return queryClient.invalidateQueries({ queryKey: agentKeys.list() });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentsApi.remove(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: agentKeys.detail(id) });
      return queryClient.invalidateQueries({ queryKey: agentKeys.list() });
    },
  });
}

export const botKeys = {
  status: ["bot", "status"] as const,
};

/** Polled, so the running badge and call count follow deploys made elsewhere. */
export function useBotStatus() {
  return useQuery({
    queryKey: botKeys.status,
    queryFn: botApi.status,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
}

/** Switch the voice bot to an agent. */
export function useDeployAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: botApi.deploy,
    onSuccess: (status) => {
      queryClient.setQueryData(botKeys.status, status);
    },
  });
}

/** Query keys for stored calls; `callKeys.agent(id)` invalidates everything about an agent's calls. */
export const callKeys = {
  all: ["calls"] as const,
  agent: (agentId: string) => [...callKeys.all, agentId] as const,
  list: (agentId: string, outcomes: readonly CallOutcome[]) =>
    [...callKeys.agent(agentId), "list", [...outcomes].sort()] as const,
  detail: (agentId: string, callId: string) =>
    [...callKeys.agent(agentId), "detail", callId] as const,
};

/** How often an open call log looks for new calls. */
const CALLS_POLL_MS = 15_000;

/**
 * An agent's recent calls, newest first, optionally only some outcomes. Polls
 * while enabled, so calls that finish appear on their own.
 */
export function useAgentCalls(
  agentId: string,
  outcomes: readonly CallOutcome[],
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: callKeys.list(agentId, outcomes),
    queryFn: () => callsApi.list(agentId, { outcomes }),
    enabled,
    refetchInterval: enabled ? CALLS_POLL_MS : false,
    // Keep the old list on screen while a new filter loads.
    placeholderData: (previous) => previous,
  });
}

/** One call in full. A stored call never changes, so it's fetched once. */
export function useCall(agentId: string, callId: string) {
  return useQuery({
    queryKey: callKeys.detail(agentId, callId),
    queryFn: () => callsApi.get(agentId, callId),
    staleTime: Infinity,
  });
}
