import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { ConfirmProvider } from "@/shared/ui";
import { queryClient } from "./queryClient";
import { router } from "./router";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
