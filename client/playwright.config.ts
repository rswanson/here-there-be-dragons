import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
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
  // E2E tests expect both the backend (port 3000) and Vite dev server (port 5173) to be running.
  // Start them before running: docker compose -f docker/docker-compose.dev.yml up -d
  //   cargo run -p server  (with DATABASE_URL and JWT_SECRET set)
  //   cd client && npm run dev
})
