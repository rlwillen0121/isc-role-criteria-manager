/**
 * Regression guard for the renderer bootstrap failure.
 *
 * History: the custom webpack config (`angular.webpack.js`) set
 * `config.target = 'electron-renderer'`. That target enables webpack's Node
 * "externals" preset, which emits bare `require("events")` (and other Node
 * core modules) into the renderer bundle. The Electron renderer runs with
 * `contextIsolation: true` (see app/main.ts), so it has no Node `require`:
 * the bundle threw "require is not defined", zone.js never initialised
 * (NG0908) and Angular never bootstrapped — `<app-root>` stayed "Loading..."
 * forever. The symptom only surfaced under `ng serve` / `npm start` (the dev
 * workflow); the production build masked it because the optimizer dropped the
 * unreachable externals, which is how it slipped through CI twice.
 *
 * This test pins the root cause: the renderer must be bundled for a browser
 * target so Node core modules are polyfilled (NodePolyfillPlugin) instead of
 * externalised to `require`. If anyone flips the target back to
 * 'electron-renderer' (or any 'node'/'electron-*' target), this fails.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const customWebpack = require('../../angular.webpack.js') as (
  config: { target?: string; plugins: unknown[] },
  options: Record<string, unknown>
) => { target?: string; plugins: unknown[] };

describe('renderer webpack target (bootstrap regression guard)', () => {
  const run = () => customWebpack({ plugins: [] }, {});

  it('does not externalise Node core modules to require() in the renderer', () => {
    const { target } = run();
    // 'electron-renderer' / 'node' / 'electron-main' all enable webpack's node
    // externals preset, which is what broke the contextIsolation:true renderer.
    expect(target).not.toMatch(/^(node|electron-)/);
  });

  it('bundles the renderer for a browser (web) environment', () => {
    expect(run().target).toBe('web');
  });

  it('keeps a Node polyfill plugin so browser-safe shims replace core modules', () => {
    // With a web target, transitive deps that reference Node core (e.g. events,
    // stream, buffer) need browser shims; NodePolyfillPlugin must stay wired.
    expect(run().plugins.length).toBeGreaterThan(0);
  });
});
