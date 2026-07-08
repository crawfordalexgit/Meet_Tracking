// Playwright config — safe suites (api, integrity, e2e) run by default.
// The destructive project only runs when named explicitly AND a fresh backup exists
// (gate enforced in tests/destructive/_gate.js).
// Heavy external tests (@ai Gemini, @pdf Puppeteer) skip unless RUN_HEAVY=1.
const { defineConfig } = require('@playwright/test');
const path = require('path');

const STORAGE_STATE = path.join(__dirname, 'tests', '.auth', 'state.json');

// Port is configurable so parallel worktrees / fix sessions don't collide on
// :3000. Override with PORT=3010 (the dev server is started with -p PORT and
// baseURL/global-setup follow it).
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.js',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/.report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    // Reuse only the default port; a custom PORT means "give me a clean isolated
    // server" so verification never reuses a fix session's stale build.
    reuseExistingServer: !process.env.PORT,
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
