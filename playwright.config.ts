import { defineConfig } from '@playwright/test';

// BASE_URL=https://maplesworld.org runs the suite against a deployed site instead of the local dev server.
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  webServer: process.env.BASE_URL ? undefined : { command: 'npx vite --port 5173 --strictPort', port: 5173, reuseExistingServer: true, timeout: 60_000 },
  use: {
    baseURL: BASE_URL,
    launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
});
