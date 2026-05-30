//Polyfill Node.js core modules in Webpack. This module is only needed for webpack 5+.
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

/**
 * Custom angular webpack configuration
 */
module.exports = (config, options) => {
    // The renderer must be bundled for a browser environment, NOT
    // 'electron-renderer'. The 'electron-renderer' target enables webpack's
    // node externals preset, which emits bare `require("events")` (and other
    // Node core modules) into the bundle. Those calls only work when the
    // renderer has Node's `require` available — i.e. with nodeIntegration:true
    // AND contextIsolation:false. This app runs with contextIsolation:true
    // (app/main.ts), so `require` is undefined in the renderer: polyfills.js
    // throws "require is not defined", zone.js never initialises (NG0908) and
    // Angular never bootstraps (<app-root> stays "Loading..." forever).
    //
    // The renderer never touches Node/Electron APIs directly — it talks to the
    // main process through the contextBridge `window.electronAPI` exposed in
    // app/preload.ts. So a 'web' target is correct, and NodePolyfillPlugin
    // (below) supplies browser-safe shims for any Node core modules that
    // transitive deps reference, instead of externalising them to `require`.
    config.target = 'web';

    config.plugins = [
        ...config.plugins,
        new NodePolyfillPlugin({
			  excludeAliases: ["console"]
		})
    ];

    return config;
}
