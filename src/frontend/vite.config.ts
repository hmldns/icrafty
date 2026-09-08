import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { modelCatalogPlugin } from "./tooling/modelCatalog.ts";

const agentProxy = { "/api/agent": { target: process.env.CRAFTY_AGENT_URL ?? "http://127.0.0.1:8787", ws: true } };

export default defineConfig({
  plugins: [react(), tailwindcss(), modelCatalogPlugin()],
  worker: { format: "es" },
  server: { host: "127.0.0.1", port: 5187, strictPort: true, proxy: agentProxy },
  preview: { host: "127.0.0.1", port: 4187, strictPort: true, proxy: agentProxy },
});
