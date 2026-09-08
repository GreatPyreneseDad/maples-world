import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  webServer: { command: 'npx vite --port 5173 --strictPort', port: 5173, reuseExistingServer: true, timeout: 60_000 },
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
});
