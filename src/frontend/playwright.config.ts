import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.CRAFTY_TEST_PORT ?? 5287);

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/model-production.spec.ts",
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--enable-unsafe-swiftshader",
      ],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run test:server",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
