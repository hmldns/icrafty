import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.CRAFTY_PREVIEW_PORT ?? 4187);

export default defineConfig({
  testDir: "./tests",
  testMatch: "model-production.spec.ts",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run preview -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
