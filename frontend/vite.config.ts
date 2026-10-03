import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  css: {
    modules: { localsConvention: "camelCaseOnly" },
  },
  server: {
    port: 5173,
    // The backend (backend/src/main.py, `make api`). changeOrigin, so URLs the API
    // builds from its host (the bot's client_url) point at :7860, not at Vite.
    proxy: { "/api": { target: "http://localhost:7860", changeOrigin: true } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
