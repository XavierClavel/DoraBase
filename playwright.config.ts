import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  webServer: { command: 'pnpm dev', port: 5173, reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1360, height: 814 } },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0 } },
})
