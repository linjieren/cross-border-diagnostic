import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "./playwright-report" }],
    ["json", { outputFile: "./playwright-report/results.json" }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: "docker compose -f ../ops/docker-compose.dev.yml up -d",
        port: 8080,
        reuseExistingServer: true,
        timeout: 60000,
      },
});
