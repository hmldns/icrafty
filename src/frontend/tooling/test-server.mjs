import { copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = new URL("./.test-models/server/", import.meta.url);
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
for (const name of [
  "bracket.stl",
  "rounded-cube.step",
  "solid-block.stl",
  "sleeve.stl",
])
  await copyFile(
    new URL(`./models/${name}`, import.meta.url),
    new URL(name, root),
  );
process.env.CRAFTY_MODEL_ROOT = fileURLToPath(root);
const server = await createServer({
  cacheDir: "node_modules/.vite-tests",
  server: {
    host: "127.0.0.1",
    port: Number(process.env.CRAFTY_TEST_PORT ?? 5287),
    strictPort: true,
  },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
