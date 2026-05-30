/**
 * Smoke test: role-criteria-manager happy path (dry-run, read-only)
 *
 * Clicks "Connect to Environment", navigates to RoleCriteriaManager,
 * searches for a birthright role, configures an "Add value(s)" op, previews
 * in dry-run mode, and asserts Execute is disabled. No tenant writes occur.
 *
 * Run with: npm run e2e -- --grep "Role Criteria"
 * Override role search: SMOKE_ROLE_FILTER=my-role npm run e2e ...
 */

import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { test, expect } from '@playwright/test';
import * as PATH from 'path';

const ROLE_FILTER = process.env['SMOKE_ROLE_FILTER'] ?? 'birthright';
const TIMEOUT = 45_000;

test.describe('Role Criteria Manager smoke (dry-run)', () => {
  let app: ElectronApplication;
  let win: Page;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [PATH.join(__dirname, '../electron-dist/main.js')],
      cwd: PATH.join(__dirname, '..'),
      // Force a large window so no buttons are clipped
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    });
    win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');

    // Maximise the window so nothing is cut off
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].maximize();
    });
  });

  test.afterAll(async () => {
    await app.close().catch(() => { /* ignore if already closed */ });
  });

  test('full happy path: connect → search → operation → preview', async () => {
    // ── 1. Connect ──────────────────────────────────────────────────────────
    const connectBtn = win.getByRole('button', { name: /Connect to Environment/i });
    await connectBtn.waitFor({ state: 'visible', timeout: TIMEOUT });
    await connectBtn.click();

    // Wait for connected dashboard
    await expect(win.locator('.dashboard-page')).toBeVisible({ timeout: TIMEOUT });
    console.log('Connected to tenant.');

    // ── 2. Navigate to Role Criteria Manager ────────────────────────────────
    // Use Angular router link in the sidebar (visible once connected)
    const rcmNavLink = win.locator('a[routerlink="/role-criteria-manager"], a[ng-reflect-router-link="/role-criteria-manager"]');
    const rcmNavVisible = await rcmNavLink.isVisible().catch(() => false);

    if (rcmNavVisible) {
      await rcmNavLink.click();
    } else {
      // Fall back to direct hash navigation if nav link is hidden/disabled
      await win.evaluate(() => { window.location.hash = '#/role-criteria-manager'; });
    }

    // The RCM component's search input is the reliable signal it's loaded
    const searchInput = win.locator('input[placeholder="e.g. DL - Engineering"]');
    await searchInput.waitFor({ state: 'visible', timeout: TIMEOUT });
    console.log('Role Criteria Manager loaded.');

    // ── 3. Search ───────────────────────────────────────────────────────────
    // Switch to Bulk mode so "birthright" matches any role whose name contains it
    await win.getByLabel(/Bulk \(name contains\)/i).click();
    await searchInput.fill(ROLE_FILTER);
    await win.getByRole('button', { name: /Find Roles/i }).click();

    const resultCount = win.locator('.result-count');
    const emptyState  = win.getByText('No roles matched your search.');
    const snackBar    = win.locator('mat-snack-bar-container');

    await Promise.race([
      resultCount.waitFor({ state: 'visible', timeout: TIMEOUT }),
      emptyState.waitFor({ state: 'visible', timeout: TIMEOUT }),
      snackBar.waitFor({ state: 'visible', timeout: TIMEOUT }),
    ]);

    if (await snackBar.isVisible()) {
      const snackText = (await snackBar.textContent()) ?? '';
      if (snackText.includes('No roles matched')) {
        test.skip(true, `No roles matched "${ROLE_FILTER}" — set SMOKE_ROLE_FILTER`);
        return;
      }
      throw new Error(`API error — snackbar: ${snackText}`);
    }
    if (await emptyState.isVisible().catch(() => false)) {
      test.skip(true, `No roles matched "${ROLE_FILTER}" — set SMOKE_ROLE_FILTER`);
      return;
    }

    const countText = (await resultCount.textContent())?.trim() ?? '';
    console.log('Roles found:', countText);
    expect(countText).toMatch(/\d+ role\(s\) found/);

    // ── 4. Select first role (bulk mode leaves all unchecked by default) ────
    await win.locator('table.role-table mat-checkbox').first().click();

    // ── 5. Advance to Operation step ────────────────────────────────────────
    await win.getByRole('button', { name: /^Next$/i }).click();
    await expect(win.getByText(/attribute\(s\) found/i)).toBeVisible({ timeout: TIMEOUT });
    console.log('Operation step loaded.');

    // ── 5. Pick "Add value(s)" and fill a no-op value ──────────────────────
    await win.getByRole('tab', { name: /Add value\(s\)/i }).click();
    await win.getByLabel('Attribute').first().fill('department');
    await win.getByLabel(/Value\(s\) to add/i).fill('SMOKE_TEST_DRY_RUN');

    // ── 6. Preview ──────────────────────────────────────────────────────────
    await win.getByRole('button', { name: /Preview/i }).click();
    await expect(win.locator('.preview-summary')).toBeVisible({ timeout: TIMEOUT });
    console.log('Preview:', (await win.locator('.preview-summary').textContent())?.trim());

    // Dry-run guard must be on; Execute must be disabled
    await expect(win.getByText(/Dry run is on/i)).toBeVisible({ timeout: 10_000 });
    await expect(win.getByRole('button', { name: /Execute/i })).toBeDisabled();

    console.log('Smoke test PASSED — full dry-run flow verified.');
  });
});
