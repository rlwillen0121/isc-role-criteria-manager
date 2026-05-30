import { BrowserContext, ElectronApplication, Page, _electron as electron } from 'playwright';
import { test, expect } from '@playwright/test';
import * as PATH from 'path';

test.describe('Check Home Page', () => {
  let app: ElectronApplication;
  let firstWindow: Page;
  let context: BrowserContext;

  test.beforeAll( async () => {
    // On Linux CI containers, Electron needs --disable-gpu and --no-sandbox
    // (the kernel sandbox features aren't available in most CI environments).
    const extraArgs = process.env['CI']
      ? ['--disable-gpu', '--no-sandbox']
      : [];
    app = await electron.launch({
      args: [PATH.join(__dirname, '../electron-dist/main.js'), ...extraArgs],
      cwd: PATH.join(__dirname, '..')
    });
    context = app.context();
    await context.tracing.start({ screenshots: true, snapshots: true });
    firstWindow = await app.firstWindow();
    await firstWindow.waitForLoadState('domcontentloaded');
  });

  test('Launch electron app', async () => {

    const windowState: { isVisible: boolean; isDevToolsOpened: boolean; isCrashed: boolean } = await app.evaluate(async (process) => {
      const mainWindow = process.BrowserWindow.getAllWindows()[0];

      const getState = () => ({
        isVisible: mainWindow.isVisible(),
        isDevToolsOpened: mainWindow.webContents.isDevToolsOpened(),
        isCrashed: mainWindow.webContents.isCrashed(),
      });

      return new Promise((resolve) => {
        if (mainWindow.isVisible()) {
          resolve(getState());
        } else {
          mainWindow.once('ready-to-show', () => setTimeout(() => resolve(getState()), 0));
        }
      });
    });

    expect(windowState.isVisible).toBeTruthy();
    expect(windowState.isDevToolsOpened).toBeFalsy();
    expect(windowState.isCrashed).toBeFalsy();
  });

  // Regression guard: the renderer must actually bootstrap Angular. The
  // index.html ships `<app-root>Loading...</app-root>`; if bootstrap fails
  // (e.g. the renderer bundle calls Node's `require`, which is absent under
  // contextIsolation:true), that placeholder text is never replaced and the
  // app is a dead "Loading..." screen. This is the check that was missing
  // when a non-booting app merged twice.
  test('renderer bootstraps Angular (app-root is not stuck on "Loading...")', async () => {
    // Wait for Angular to replace the placeholder, then assert on the result.
    await firstWindow
      .locator('app-root')
      .filter({ hasNotText: 'Loading...' })
      .first()
      // Allow extra time on CI — Linux runners are slower than local macOS
      .waitFor({ state: 'attached', timeout: process.env['CI'] ? 60000 : 20000 });

    const appRootText = (await firstWindow.locator('app-root').innerText()).trim();
    expect(appRootText.length).toBeGreaterThan(0);
    expect(appRootText).not.toBe('Loading...');
  });

  // test('Check Home Page design', async ({ browserName}) => {
  //   // Uncomment if you change the design of Home Page in order to create a new screenshot
  //   const screenshot = await firstWindow.screenshot({ path: '/tmp/home.png' });
  //   expect(screenshot).toMatchSnapshot(`home-${browserName}.png`);
  // });

  // test('Check title', async () => {
  //   const elem = await firstWindow.$('app-home h1');
  //   const text = elem ? await elem.innerText() : null;
  //   expect(text).toBe('App works !');
  // });

  test.afterAll( async () => {
    await context.tracing.stop({ path: 'e2e/tracing/trace.zip' });
    await app.close();
  });
});
