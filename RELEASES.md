# Release Process

## How to cut a release

1. Ensure `main` is clean and passing CI.

2. Update the version in `package.json` and commit:
   ```
   npm version patch   # or minor / major
   git push origin main
   ```
   (`npm version` edits `package.json` and creates a local tag automatically.)

3. Push the tag:
   ```
   git push --tags
   ```

4. The **Release** GitHub Actions workflow triggers on the `v*` tag and builds
   unsigned installers on Ubuntu, Windows, and macOS. When all three jobs pass,
   three artifacts are attached to the GitHub Release that GitHub creates from
   the tag:
   - `*.AppImage` — Linux
   - `*.exe` — Windows (portable, no installer)
   - `*.dmg` — macOS

5. Open the draft release on GitHub, add release notes, and publish it.

---

## Unsigned binaries — user instructions

These builds are **not code-signed**. Users will see a security warning the
first time they open the app. Instructions by platform:

### macOS — Gatekeeper

macOS blocks unsigned DMGs by default. Users must do one of the following
after mounting the DMG and dragging the app to `/Applications`:

**Option A — Right-click to open (simplest):**
1. Right-click (or Control-click) `ISC Role Criteria Manager.app` in Finder.
2. Choose **Open** from the context menu.
3. Click **Open** in the dialog that appears.
   The app is now whitelisted for future launches.

**Option B — System Settings:**
1. Try to open the app normally; macOS will block it.
2. Open **System Settings → Privacy & Security**.
3. Scroll to the Security section and click **Open Anyway** next to the app name.

### Windows — SmartScreen

Windows may show a "Windows protected your PC" prompt for the unsigned `.exe`.

1. Click **More info** in the SmartScreen dialog.
2. Click **Run anyway**.

### Linux — AppImage

No signing barrier. Make the file executable and run:
```
chmod +x ISC-Role-Criteria-Manager-*.AppImage
./ISC-Role-Criteria-Manager-*.AppImage
```

---

## Notes for future code-signing

- **macOS:** Requires an Apple Developer ID certificate + notarization via
  `electron-notarize`. Set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_ID_PASSWORD`, and `APPLE_TEAM_ID` secrets in the repo and add
  notarization hooks to `electron-builder.json`.
- **Windows:** Requires an EV or OV certificate (`.pfx`). Set `CSC_LINK` and
  `CSC_KEY_PASSWORD` secrets. SmartScreen reputation builds up over time even
  with a valid OV cert.

Unsigned v1 community releases are acceptable while the tool is in early
development. Add signing before promoting to any enterprise distribution.
