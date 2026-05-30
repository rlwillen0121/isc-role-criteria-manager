/**
 * Smoke test: role-criteria-manager happy path (dry-run, read-only)
 *
 * Navigates to the RoleCriteriaManager, searches for any role whose name
 * contains the SMOKE_ROLE_FILTER env var (defaults to ""), picks the first
 * result, configures an "Add value(s)" no-op, previews it in dry-run mode,
 * and confirms the Preview step renders without errors.
 *
 * Does NOT execute — dry run stays ON throughout, so no tenant writes occur.
 */

import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { test, expect } from '@playwright/test';
import * as PATH from 'path';

const ROLE_FILTER = process.env['SMOKE_ROLE_FILTER'] ?? 'a';
const TIMEOUT = 30_000;

test.describe('Role Criteria Manager smoke (dry-run)', () => {
  let app: ElectronApplication;
  let win: Page;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [PATH.join(__dirname, '../electron-dist/main.js')],
      cwd: PATH.join(__dirname, '..'),
    });
    win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('navigates to Role Criteria Manager', async () => {
    // Navigate via the router — use window.location since nav links may vary
    await win.evaluate(() => {
      (window as Window & { ngZone?: { run: (fn: () => void) => void } })
        .ngZone?.run(() => {
          window.location.hash = '#/role-criteria-manager';
        });
    });
    // Fallback: direct hash navigation
    await win.evaluate(() => {
      window.location.hash = '#/role-criteria-manager';
    });

    await expect(
      win.locator('app-role-criteria-manager, [selector="app-role-criteria-manager"]').first()
    ).toBeVisible({ timeout: TIMEOUT }).catch(() => {
      // Try mat-toolbar with title text as fallback signal
      return expect(win.getByText('Role Criteria Manager').first()).toBeVisible({ timeout: 5000 });
    });
  });

  test('Step 1: search input is present and Find Roles button works', async () => {
    const searchInput = win.locator('input[placeholder="e.g. DL - Engineering"]');
    await searchInput.waitFor({ state: 'visible', timeout: TIMEOUT });
    await searchInput.fill(ROLE_FILTER);

    await win.getByRole('button', { name: /Find Roles/i }).click();

    const resultCount = win.locator('.result-count');
    const emptyState = win.locator('.empty-state');
    const snackBar = win.locator('mat-snack-bar-container');

    await Promise.race([
      resultCount.waitFor({ state: 'visible', timeout: TIMEOUT }),
      emptyState.waitFor({ state: 'visible', timeout: TIMEOUT }),
      snackBar.waitFor({ state: 'visible', timeout: TIMEOUT }),
    ]);

    const snackVisible = await snackBar.isVisible();
    if (snackVisible) {
      const snackText = await snackBar.textContent();
      throw new Error(`API error or no auth — snackbar: ${snackText}`);
    }

    const isEmpty = await emptyState.isVisible();
    if (isEmpty) {
      console.log(`No roles matched filter "${ROLE_FILTER}" — set SMOKE_ROLE_FILTER to a known role name fragment.`);
      test.skip();
      return;
    }

    const countText = await resultCount.textContent();
    console.log('Roles found:', countText?.trim());
    expect(countText).toMatch(/\d+ role\(s\) found/);
  });

  test('Step 2: advances to Operation step and loads criteria', async () => {
    await win.getByRole('button', { name: /^Next$/i }).click();
    await expect(win.getByText(/attribute\(s\) found/i)).toBeVisible({ timeout: TIMEOUT });
    console.log('Operation step loaded with criteria attributes.');
  });

  test('Step 2: selects "Add value(s)" tab and fills dummy op', async () => {
    await win.getByRole('tab', { name: /Add value\(s\)/i }).click();
    await win.getByLabel('Attribute').first().fill('department');
    await win.getByLabel(/Value\(s\) to add/i).fill('SMOKE_TEST_DRY_RUN');
  });

  test('Step 3: Preview renders with dry-run guard and Execute disabled', async () => {
    await win.getByRole('button', { name: /Preview/i }).click();

    await expect(win.locator('.preview-summary')).toBeVisible({ timeout: TIMEOUT });
    const summary = await win.locator('.preview-summary').textContent();
    console.log('Preview summary:', summary?.trim());

    await expect(win.getByText(/Dry run is on/i)).toBeVisible({ timeout: 5000 });
    await expect(win.getByRole('button', { name: /Execute/i })).toBeDisabled();

    console.log('Smoke test passed — role update flow works end-to-end (dry-run).');
  });
});
