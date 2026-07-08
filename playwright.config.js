// Playwright config — safe suites (api, integrity, e2e) run by default.
// The destructive project only runs when named explicitly AND a fresh backup exists
// (gate enforced in tests/destructive/_gate.js).
// Heavy external tests (@ai Gemini, @pdf Puppeteer) skip unless RUN_HEAVY=1.
const { defineConfig } = require('@playwright/test');
const path = require('path');

const STORAGE_STATE = path.join(__dirname, 'tests', '.auth', 'state.json');

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.js',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/.report' }]],
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'unit',
      testDir: './tests/unit',
    },
    {
      name: 'api',
      testDir: './tests/api',
    },
    {
      name: 'integrity',
      testDir: './tests/integrity',
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { storageState: STORAGE_STATE },
    },
    {
      name: 'destructive',
      testDir: './tests/destructive',
      workers: 1,
      fullyParallel: false,
      timeout: 600_000,
    },
  ],
});

module.exports.STORAGE_STATE = STORAGE_STATE;
