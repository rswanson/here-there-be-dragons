import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    // Headless Chromium with WebGL support
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  // Local dev: start backend + Vite dev server, then run tests (baseURL defaults to :5173)
  // CI: server serves built client on :3000, set BASE_URL=http://localhost:3000
})
