import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { modelCatalogPlugin } from "./tooling/modelCatalog.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), modelCatalogPlugin()],
  worker: { format: "es" },
  server: { host: "127.0.0.1", port: 5187, strictPort: true },
  preview: { host: "127.0.0.1", port: 4187, strictPort: true },
});
