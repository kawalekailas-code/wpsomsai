import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5173", viewport: { width: 1440, height: 940 }, screenshot: "only-on-failure", launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } },
  webServer: { command: "npm run dev -- --port 5173", env: { VITE_DEMO_MODE: "true" }, url: "http://127.0.0.1:5173", reuseExistingServer: !process.env.CI, timeout: 60000 }
});
