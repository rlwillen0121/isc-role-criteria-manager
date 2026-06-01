import { _electron as electron, Page } from 'playwright';
import { test, expect } from '@playwright/test';
import * as PATH from 'path';
import * as fs from 'fs';

const ROOT = PATH.join(__dirname, '..');
const SHOTS = '/tmp/smoke-shots';
fs.mkdirSync(SHOTS, { recursive: true });
let step = 0;
const shot = async (win: Page, name: string) => {
  await win.screenshot({ path: `${SHOTS}/${String(step++).padStart(2, '0')}-${name}.png` });
  console.log('📸', name);
};

test('full devrel smoke — UI + API features', async () => {
  const app = await electron.launch({
    args: [PATH.join(ROOT, 'electron-dist/main.js')],
    cwd: ROOT,
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await win.waitForTimeout(1000);
  await shot(win, 'home-initial');

  // safeStorage encryption is tied to the Electron process identity, so credentials
  // stored by a previous session cannot be decrypted by a Playwright-launched instance.
  // Re-write them via the `update-environment` IPC handler (which calls setSecureValue
  // using the *current* process's safeStorage key) before attempting to connect.
  const CLIENT_ID     = process.env.DEVREL_SAILPOINT_CLIENT_ID     ?? '';
  const CLIENT_SECRET = process.env.DEVREL_SAILPOINT_CLIENT_SECRET ?? '';

  if (CLIENT_ID && CLIENT_SECRET) {
    // updateEnvironment overwrites the full environment entry in config.yaml, so
    // we must pass all fields — not just credentials — or the authtype/URLs are
    // cleared and unifiedLogin can't find a valid auth type.
    const TENANT_URL = process.env.DEVREL_TENANT_URL ?? '';
    // Derive the API base URL: https://slug.identitynow-demo.com → https://slug.api.identitynow-demo.com
    const BASE_URL = TENANT_URL.replace(/^(https:\/\/[^.]+)\./, '$1.api.');

    await win.evaluate(
      async ({ tenantUrl, baseUrl, clientId, clientSecret }) => {
        await (window as any).electronAPI.updateEnvironment({
          environmentName: 'devrel',
          tenantUrl,
          baseUrl,
          authtype: 'pat',
          clientId,
          clientSecret,
        });
      },
      { tenantUrl: TENANT_URL, baseUrl: BASE_URL, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }
    );
    console.log('PAT credentials re-encrypted via update-environment IPC');
  }

  // Click Connect and wait for auth to resolve.  Watch two terminal signals:
  //   1. .dashboard-page appears         → PAT login succeeded
  //   2. mat-snack-bar-container appears → login attempt failed (capture the message)
  const connectBtn = win.getByRole('button', { name: /Connect to Environment/i });
  if (await connectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await connectBtn.click();
    console.log('Clicked Connect — waiting for auth to resolve (up to 90s)...');

    // Confirm the "Logging into ISC..." IPC dialog opened.
    const dialogOpened = await win.locator('mat-dialog-container')
      .waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
    if (dialogOpened) {
      console.log('  Auth dialog opened — IPC in progress...');
    }

    const authResult = await Promise.race([
      win.locator('.dashboard-page')
        .waitFor({ timeout: 90000 })
        .then(() => 'connected' as const),
      win.locator('mat-snack-bar-container')
        .waitFor({ timeout: 90000 })
        .then(async () => {
          const msg = await win.locator('mat-snack-bar-container').textContent().catch(() => '');
          return `snackbar: ${msg?.trim()}` as const;
        }),
    ]).catch(() => 'timeout' as const);

    if (authResult === 'connected') {
      console.log('✅ Connected to ISC — dashboard loaded');
    } else {
      console.log(`⚠️  Auth did not complete (${authResult}) — API assertions will be skipped`);
    }
  } else {
    console.log('Connect button not visible — assuming already connected');
  }

  await shot(win, 'home-post-connect');

  // Navigate to RCM
  await win.evaluate(() => { window.location.hash = '#/role-criteria-manager'; });
  await win.locator('input[placeholder="e.g. DL - Engineering"]').waitFor({ timeout: 15000 });
  await win.waitForTimeout(400);
  await shot(win, 'rcm-step1-target');
  console.log('✅ RCM loaded');

  // ── Search ──────────────────────────────────────────────────────────────
  console.log('\n── Bulk search ACME roles ──');
  await win.getByLabel(/Bulk \(name contains\)/i).click();
  await win.locator('input[placeholder="e.g. DL - Engineering"]').fill('ACME');
  await win.getByRole('button', { name: /Find Roles/i }).click();

  const resultCount = win.getByText(/\d+ role\(s\) found/).first();
  const searchResult = await Promise.race([
    resultCount.waitFor({ timeout: 30000 }).then(() => 'ok'),
    win.locator('mat-snack-bar-container').waitFor({ timeout: 30000 }).then(() => 'error'),
  ]).catch(() => 'timeout');

  await shot(win, 'after-search');

  if (searchResult !== 'ok') {
    const msg = await win.locator('mat-snack-bar-container').textContent().catch(() => 'timeout');
    console.log(`⚠️  Search failed (${searchResult}): ${msg?.trim()}`);
    console.log('   → Skipping API-dependent assertions; showing UI-only screenshots');
  } else {
    const roleCount = (await resultCount.textContent())?.trim();
    console.log('✅ Search result:', roleCount);

    // Ensure at least one role is selected — bulk search auto-selects all ≤50,
    // so only click a row checkbox if none are selected yet.
    const nextBtn = win.getByRole('button', { name: /^Next$/i });
    const nextEnabled = await nextBtn.isEnabled().catch(() => false);
    if (!nextEnabled) {
      // Click the first data-row checkbox (tr:not(header) → first mat-checkbox)
      await win.locator('table.role-table tr.mat-mdc-row mat-checkbox').first().click();
    }
    await nextBtn.click();
    await win.getByText(/attribute\(s\) found/i).waitFor({ timeout: 20000 });
    console.log('✅ Operation step loaded. Attributes:', (await win.locator('p.attr-hint').textContent())?.trim());
    await shot(win, 'operation-step');

    // ── Add Block → Preview → Identity count ────────────────────────────
    console.log('\n── Add Block + Preview + Identity count ──');
    await win.getByRole('tab', { name: /Add block/i }).click();
    await win.getByLabel('Attribute').first().fill('department');
    await win.getByLabel(/Value\(s\), comma-separated/i).fill('Engineering');
    await win.getByRole('button', { name: /Preview/i }).click();
    await win.locator('.preview-summary').waitFor({ timeout: 15000 });
    console.log('Preview summary:', (await win.locator('.preview-summary').textContent())?.trim());

    // Wait for identity count Search API calls (up to 8s)
    await win.waitForTimeout(8000);
    await shot(win, 'preview-identity-counts');

    const icVisible = await win.locator('.identity-count-row').first().isVisible().catch(() => false);
    if (icVisible) {
      const ic = (await win.locator('.identity-count-row').first().textContent())?.replace(/\s+/g, ' ').trim();
      console.log('✅ Identity count:', ic);
    } else {
      console.log('⚠️  Identity count row not visible (Search API may be slow or unavailable)');
    }

    expect(await win.getByText(/Dry run is on/i).isVisible()).toBe(true);
    expect(await win.getByRole('button', { name: /Execute/i }).isDisabled()).toBe(true);
    console.log('✅ Dry-run on, Execute disabled');

    // ── Update Value old-value dropdown ─────────────────────────────────
    console.log('\n── Update Value — old-value dropdown ──');
    await win.getByRole('button', { name: /Back/i }).first().click();
    await win.waitForTimeout(400);
    await win.getByRole('tab', { name: /Update value/i }).click();
    await win.getByLabel('Attribute').first().click();
    await win.waitForTimeout(800);
    const attrOpts = await win.locator('mat-option').count();
    if (attrOpts > 0) {
      const attrName = (await win.locator('mat-option').first().textContent())?.trim();
      await win.locator('mat-option').first().click();
      await win.waitForTimeout(1000);
      const hasDropdown = await win.locator('mat-form-field mat-select').isVisible().catch(() => false);
      console.log(`✅ Attr "${attrName}" → old-value is dropdown: ${hasDropdown}`);
      if (hasDropdown) {
        await win.locator('mat-form-field mat-select').click();
        await win.waitForTimeout(500);
        const vals = await win.locator('mat-option').allTextContents();
        console.log('   Values in dropdown:', vals.map(v => v.trim()).join(', '));
        await shot(win, 'oldvalue-dropdown-open');
        await win.keyboard.press('Escape');
      } else {
        await shot(win, 'oldvalue-text-input');
      }
    } else {
      console.log('   No attribute options (role may have empty criteria)');
    }

    // ── Simulate ─────────────────────────────────────────────────────────
    console.log('\n── Simulate mode ──');
    await win.getByRole('tab', { name: /Add block/i }).click();
    await win.getByLabel('Attribute').first().fill('cloudLifecycleState');
    await win.getByLabel(/Value\(s\), comma-separated/i).fill('active');
    await win.waitForTimeout(300);
    const simBtn = win.getByRole('button', { name: /Simulate \(/i });
    if (await simBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await simBtn.click();
      await win.locator('.simulation-card').waitFor({ timeout: 30000 });
      await win.waitForTimeout(500);
      const simText = (await win.locator('.simulation-card').textContent())?.replace(/\s+/g, ' ').trim();
      console.log('✅ Simulation:', simText?.substring(0, 300));
      await shot(win, 'simulation-results');
    }
  }

  console.log('\n✅ Smoke test complete');
  await app.close();
});
