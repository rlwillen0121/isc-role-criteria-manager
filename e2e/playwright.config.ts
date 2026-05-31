/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: '.',
  timeout: 180000,
  outputDir: './screenshots',
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      slowMo: 200,
    },
    trace: 'on',
  },
  expect: {
    toMatchSnapshot: { threshold: 0.2 },
  },
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
module.exports = config;
