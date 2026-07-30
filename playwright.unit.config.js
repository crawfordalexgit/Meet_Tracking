// Unit-only Playwright config.
//
// The main playwright.config.js starts a dev server and runs a globalSetup that
// signs a real test user in, so it needs TEST_USER_EMAIL/PASSWORD and a live
// database. The unit specs are pure functions over fixtures and need neither —
// but they were unrunnable without those credentials, which is a large part of
// why lib/analytics-utils.js reached launch with no coverage.
//
// Run with: npm run test:unit
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/unit',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  workers: 4,
  reporter: [['list']],
});
