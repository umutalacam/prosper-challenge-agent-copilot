import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Agents only change through this UI; avoid refetching on every focus.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
