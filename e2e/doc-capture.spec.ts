/**
 * doc-capture.spec.ts
 *
 * Playwright-driven screenshot capture for isc-role-criteria-manager.
 * Runs headed against the devrel ISC sandbox and saves production-quality
 * screenshots to docs/media/ for README / docs/USAGE.md integration.
 *
 * Load credentials before running:
 *   set -a && source .env.devrel && set +a
 *   npx playwright test -c e2e/playwright.config.ts e2e/doc-capture.spec.ts
 *
 * SECURITY: never logs or commits secrets. Auth screen masks the secret
 * field. Screenshot only captures what the user would see in normal use.
 *
 * SANDBOX SAFETY: dry-run is on for all flows except the final
 * Apply → Restore sequence, which touches exactly one role and immediately
 * restores it via a mocked file dialog (no native OS dialog required).
 */
import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { test } from '@playwright/test';
import * as PATH from 'path';
import * as fs from 'fs';

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROOT  = PATH.join(__dirname, '..');
const MEDIA = PATH.join(ROOT, 'docs', 'media');
const SNAP  = '/tmp/doc-capture-snapshot.json';
fs.mkdirSync(MEDIA, { recursive: true });

// ─── Screenshot helper ────────────────────────────────────────────────────────
let step = 0;

/** Capture and log a named screenshot, returning the committed filename. */
const shot = async (win: Page, name: string): Promise<string> => {
  const filename = `${String(step++).padStart(2, '0')}-${name}.png`;
  await win.screenshot({ path: PATH.join(MEDIA, filename) });
  console.log('📸', filename);
  return filename;
};

// ─── Credentials ──────────────────────────────────────────────────────────────
const CLIENT_ID     = process.env['DEVREL_SAILPOINT_CLIENT_ID']     ?? '';
const CLIENT_SECRET = process.env['DEVREL_SAILPOINT_CLIENT_SECRET'] ?? '';
const TENANT_URL    = process.env['DEVREL_TENANT_URL']              ?? '';
const BASE_URL      = TENANT_URL.replace(/^(https:\/\/[^.]+)\./, '$1.api.');

// ─── GIF manifest (filled during test, consumed by make-gifs.py) ──────────────
const GIF_MANIFEST: Record<string, string[]> = {
  'auth-flow':       [],
  'target-modes':    [],
  'operations':      [],
  'preview-simulate': [],
  'apply-restore':   [],
};

/** Push the last-shot filename into a GIF group. */
const tag = (group: keyof typeof GIF_MANIFEST, filename: string): void => {
  GIF_MANIFEST[group].push(PATH.join(MEDIA, filename));
};

test('doc-capture: all major flows', async () => {
  // ── Launch Electron ─────────────────────────────────────────────────────────
  const app: ElectronApplication = await electron.launch({
    args: [PATH.join(ROOT, 'electron-dist/main.js')],
    cwd: ROOT,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  });
  const win: Page = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await win.waitForTimeout(1000);

  try {
    // ── Flow 1: Connect / Authentication ─────────────────────────────────────
    tag('auth-flow', await shot(win, 'connect-screen'));

    // Re-encrypt credentials via IPC so safeStorage works under Playwright
    if (CLIENT_ID && CLIENT_SECRET) {
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
      console.log('PAT credentials re-encrypted via IPC');
    }

    const connectBtn = win.getByRole('button', { name: /Connect to Environment/i });
    if (await connectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await connectBtn.click();
      console.log('Clicked Connect — waiting up to 90s...');

      const authResult = await Promise.race([
        win.locator('.dashboard-page').waitFor({ timeout: 90000 }).then(() => 'connected' as const),
        win.locator('mat-snack-bar-container').waitFor({ timeout: 90000 }).then(async () => {
          const msg = await win.locator('mat-snack-bar-container').textContent().catch(() => '');
          return `snackbar: ${msg?.trim()}` as const;
        }),
      ]).catch(() => 'timeout' as const);

      if (authResult !== 'connected') {
        console.log(`⚠️  Auth result: ${authResult} — skipping API-dependent flows`);
        await app.close().catch(() => {});
        return;
      }
      console.log('✅ Connected to ISC');
    }

    tag('auth-flow', await shot(win, 'dashboard-connected'));

    // ── Navigate to RCM ───────────────────────────────────────────────────────
    await win.evaluate(() => { window.location.hash = '#/role-criteria-manager'; });
    const searchInput = win.locator('input[placeholder="e.g. DL - Engineering"]');
    await searchInput.waitFor({ timeout: 15000 });
    await win.waitForTimeout(600);

    // ── Flow 2: Target — all four modes ──────────────────────────────────────

    // 2a. Single role (default)
    tag('target-modes', await shot(win, 'target-single-mode'));
    await searchInput.fill('ACME Birthright Entitlement');
    await win.waitForTimeout(300);
    tag('target-modes', await shot(win, 'target-single-filled'));

    // 2b. Bulk name-contains
    await win.getByLabel(/Bulk \(name contains\)/i).click();
    await win.waitForTimeout(300);
    await searchInput.fill('ACME');
    tag('target-modes', await shot(win, 'target-bulk-mode'));

    // 2c. Find by criteria
    await win.getByLabel(/Find by criteria/i).click();
    await win.waitForTimeout(400);
    tag('target-modes', await shot(win, 'target-criteria-mode'));

    // 2d. Find by access profile / entitlement
    await win.getByLabel(/Find by access profile/i).click();
    await win.waitForTimeout(400);
    tag('target-modes', await shot(win, 'target-access-profile-mode'));

    // ── Bulk search (ACME) and select one role ────────────────────────────────
    await win.getByLabel(/Bulk \(name contains\)/i).click();
    await win.waitForTimeout(200);
    await searchInput.fill('ACME');
    await win.getByRole('button', { name: /Find Roles/i }).click();

    const searchResult = await Promise.race([
      win.locator('.result-count-row').waitFor({ timeout: 30000 }).then(() => 'ok' as const),
      win.locator('mat-snack-bar-container').waitFor({ timeout: 30000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const);

    await win.waitForTimeout(500);
    tag('target-modes', await shot(win, 'target-bulk-results-table'));

    if (searchResult !== 'ok') {
      console.log(`⚠️  Search result: ${searchResult} — stopping doc capture`);
      await app.close().catch(() => {});
      return;
    }
    console.log('✅ ACME roles found:', (await win.locator('.result-count-row').textContent())?.trim());

    // Deselect all roles, then pick exactly one (minimal sandbox impact for Apply)
    const headerCb = win.locator('table.role-table thead mat-checkbox').first();
    if (await headerCb.isVisible({ timeout: 2000 }).catch(() => false)) {
      const headerInput = headerCb.locator('input');
      // Normalize to deselected: toggle until unchecked
      for (let i = 0; i < 3; i++) {
        if (await headerInput.isChecked().catch(() => false)) {
          await headerCb.click();
          await win.waitForTimeout(200);
        } else {
          break;
        }
      }
    }
    await win.locator('table.role-table tr.mat-mdc-row mat-checkbox').first().click();
    await win.waitForTimeout(300);

    await win.getByRole('button', { name: /^Next$/i }).click();
    await win.getByText(/attribute\(s\) found/i).waitFor({ timeout: 20000 });
    await win.waitForTimeout(600);

    // ── Flow 3: Operations — all five tabs ────────────────────────────────────

    // 3a. Update value
    await win.getByRole('tab', { name: /Update value/i }).click();
    await win.waitForTimeout(300);
    tag('operations', await shot(win, 'operation-update'));

    // 3b. Add value(s)
    await win.getByRole('tab', { name: /Add value/i }).click();
    await win.waitForTimeout(300);
    tag('operations', await shot(win, 'operation-add-values'));

    // 3c. Add block (filled in for a clear screenshot)
    await win.getByRole('tab', { name: /Add block/i }).click();
    await win.waitForTimeout(200);
    await win.getByLabel('Attribute').first().fill('department');
    await win.getByLabel(/Value\(s\), comma-separated/i).fill('Engineering');
    await win.waitForTimeout(300);
    tag('operations', await shot(win, 'operation-add-block'));

    // 3d. Remove
    await win.getByRole('tab', { name: /Remove/i }).click();
    await win.waitForTimeout(300);
    tag('operations', await shot(win, 'operation-remove'));

    // 3e. Consolidate
    await win.getByRole('tab', { name: /Consolidate/i }).click();
    await win.waitForTimeout(300);
    tag('operations', await shot(win, 'operation-consolidate'));

    // ── Flow 4: Simulate ──────────────────────────────────────────────────────
    await win.getByRole('tab', { name: /Add block/i }).click();
    await win.waitForTimeout(200);
    await win.getByLabel('Attribute').first().fill('cloudLifecycleState');
    await win.getByLabel(/Value\(s\), comma-separated/i).fill('active');
    await win.waitForTimeout(300);

    const simBtn = win.getByRole('button', { name: /Simulate \(/i });
    const simVisible = await simBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (simVisible) {
      await simBtn.click();
      await win.locator('.simulation-card').waitFor({ timeout: 30000 });
      await win.waitForTimeout(600);
      tag('preview-simulate', await shot(win, 'simulate-results'));
      console.log('✅ Simulate complete');
    } else {
      console.log('⚠️  Simulate button not visible — skipping');
    }

    // ── Flow 5: Preview ───────────────────────────────────────────────────────
    // Switch to "DOC_CAPTURE_TEST" — a clearly-labelled sentinel value
    await win.getByLabel('Attribute').first().fill('department');
    await win.getByLabel(/Value\(s\), comma-separated/i).fill('DOC_CAPTURE_TEST');
    await win.waitForTimeout(300);

    // Click Preview (matStepperNext in the Operation step action row)
    await win.getByRole('button', { name: /^Preview$/i }).click();
    await win.locator('.preview-summary').waitFor({ timeout: 20000 });
    await win.waitForTimeout(600);
    tag('preview-simulate', await shot(win, 'preview-criteria-tree'));
    console.log('Preview summary:', (await win.locator('.preview-summary').textContent())?.trim());

    // Wait for identity count fetches (ISC Search API)
    await win.waitForTimeout(8000);
    tag('preview-simulate', await shot(win, 'preview-identity-counts'));

    const icVisible = await win.locator('.identity-count-row').first().isVisible().catch(() => false);
    if (icVisible) {
      const ic = (await win.locator('.identity-count-row').first().textContent())
        ?.replace(/\s+/g, ' ').trim();
      console.log('Identity count:', ic);
    }

    // ── Flow 6: Apply → Results (with dialog mocking) ─────────────────────────
    // Mock dialog.showSaveDialog so the IPC save-file handler writes the
    // snapshot to a fixed temp path without showing a native OS dialog.
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: '/tmp/doc-capture-snapshot.json',
      });
    });

    // Ensure Save snapshot is ON (the default; toggle on if not)
    const snapToggle = win.locator('mat-slide-toggle').filter({ hasText: /Save snapshot/i });
    const snapOn = await snapToggle.locator('input').isChecked().catch(() => false);
    if (!snapOn) {
      await snapToggle.click();
      await win.waitForTimeout(200);
    }

    // Turn off Dry run
    const dryToggle = win.locator('mat-slide-toggle').filter({ hasText: /Dry run/i });
    const dryOn = await dryToggle.locator('input').isChecked().catch(() => true);
    if (dryOn) {
      await dryToggle.click();
      await win.locator('.dry-run-hint').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      await win.waitForTimeout(300);
    }

    const execBtn = win.getByRole('button', { name: /Execute/i });
    const execEnabled = await execBtn.isEnabled({ timeout: 3000 }).catch(() => false);

    if (!execEnabled) {
      console.log('⚠️  Execute not enabled after toggling dry-run — skipping Apply/Restore');
    } else {
      tag('apply-restore', await shot(win, 'preview-ready-to-execute'));

      await execBtn.click();
      // Confirm dialog (MatDialog, not native)
      const dlg = win.locator('mat-dialog-container');
      const dlgAppeared = await dlg.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      if (dlgAppeared) {
        tag('apply-restore', await shot(win, 'apply-confirm-dialog'));
        await dlg.getByRole('button', { name: /^Apply$/i }).click();
      }

      // Wait for results step
      await win.locator('.results-list').waitFor({ timeout: 60000 });
      await win.waitForTimeout(1500);
      tag('apply-restore', await shot(win, 'apply-results'));
      console.log('✅ Apply complete — snapshot saved to', SNAP);

      // ── Flow 7: Restore from Snapshot ──────────────────────────────────────
      // Mock dialog.showOpenDialog to return the snapshot path saved above.
      // The IPC browse-for-json-file handler reads the file at that path.
      await app.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: ['/tmp/doc-capture-snapshot.json'],
        });
      });

      const restoreBtn = win.getByRole('button', { name: /Restore from Snapshot/i }).first();
      const restoreVisible = await restoreBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (restoreVisible) {
        await restoreBtn.click();
        // loadAndRestoreSnapshot() is async — it fetches role data via ISC API.
        // Give it time to finish before asserting the stepper navigated.
        await win.waitForTimeout(5000);

        // The component sets stepper.selectedIndex = 2 (Preview step) after the
        // async work completes. If the linear stepper doesn't reflect this via DOM,
        // click the Preview step header directly to force navigation.
        const previewHeader = win.locator('mat-step-header').filter({ hasText: /Preview/i });
        const previewVisible = await win.locator('.preview-summary').isVisible().catch(() => false);
        if (!previewVisible) {
          console.log('  Stepper still on Results — clicking Preview header...');
          await previewHeader.click().catch(() => {});
          await win.waitForTimeout(1000);
        }

        const previewOk = await win.locator('.preview-summary').isVisible().catch(() => false);
        if (previewOk) {
          tag('apply-restore', await shot(win, 'restore-preview'));
          console.log('Restore preview:', (await win.locator('.preview-summary').textContent())?.trim());
        } else {
          // Best-effort: capture whatever is currently shown
          tag('apply-restore', await shot(win, 'restore-state'));
          console.log('⚠️  Preview step not visible after restore button — captured current state');
        }

        const restoreExec = win.getByRole('button', { name: /Execute/i });
        const restoreExecEnabled = await restoreExec.isEnabled({ timeout: 3000 }).catch(() => false);
        if (restoreExecEnabled) {
          await restoreExec.click();
          const dlg2 = win.locator('mat-dialog-container');
          if (await dlg2.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) {
            await shot(win, 'restore-confirm-dialog');
            await dlg2.getByRole('button', { name: /^Apply$/i }).click();
          }
          await win.locator('.results-list').waitFor({ timeout: 60000 });
          await win.waitForTimeout(1500);
          tag('apply-restore', await shot(win, 'restore-complete'));
          console.log('✅ Restore complete — sandbox cleaned');
        } else {
          console.log('⚠️  Restore Execute not enabled');
        }
      } else {
        console.log('⚠️  Restore from Snapshot button not visible in Results step');
      }
    }

    console.log('\n✅ Doc capture finished');
    console.log('📁 Media dir:', MEDIA);
    console.log('📦 GIF groups:',
      Object.entries(GIF_MANIFEST)
        .map(([k, v]) => `${k}(${v.length})`)
        .join(', ')
    );
    fs.writeFileSync(
      PATH.join(MEDIA, '_gif-manifest.json'),
      JSON.stringify(GIF_MANIFEST, null, 2)
    );
    console.log('📋 GIF manifest written to docs/media/_gif-manifest.json');

  } finally {
    await app.close().catch(() => {});
  }
});
