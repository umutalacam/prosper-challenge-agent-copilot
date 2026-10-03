import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, StoredAgent } from "@/shared/types/agent";
import { agentsApi } from "./agents";
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

/** Create (no id) or update (id) an agent; keeps the list and detail caches in sync. */
export function useSaveAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, agent }: { id: string | null; agent: Agent }) =>
      id ? agentsApi.update(id, agent) : agentsApi.create(agent),
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
