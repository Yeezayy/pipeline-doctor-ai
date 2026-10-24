import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-public",
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173/pipeline-doctor-ai/",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run preview -- --port 4173 --strictPort --base /pipeline-doctor-ai/",
    url: "http://127.0.0.1:4173/pipeline-doctor-ai/",
    reuseExistingServer: false,
  },
});
