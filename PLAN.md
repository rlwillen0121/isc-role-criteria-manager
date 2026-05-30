# Implementation Plan — Electron UI

This document tracks the plan for building the Electron desktop app.
The PowerShell script in `scripts/` is complete and usable today.

---

## Stack

- **Framework**: [SailPoint UI Development Kit](https://github.com/sailpoint-oss/ui-development-kit) (Angular 19 + Electron)
- **UI components**: Angular Material (`mat-tree`, `mat-table`, `mat-tabs`, `mat-stepper`)
- **ISC SDK**: `sailpoint-api-client` (pre-wired in the UI Dev Kit)
- **Auth**: OAuth2 (browser flow) or PAT — handled by the kit's built-in environment manager
- **Distribution**: Cross-platform Electron builds (`.exe` / `.dmg` / `.AppImage`) via GitHub Actions

---

## Repo structure (target)

```
isc-role-criteria-manager/
├── scripts/
│   └── ISC-Update-Roles-Criteria.ps1          ← headless/scripting path (done)
├── projects/sailpoint-components/src/lib/
│   └── role-criteria-manager/                 ← the one UI component
│       ├── role-criteria-manager.component.ts
│       ├── role-criteria-manager.component.html
│       ├── role-criteria-manager.component.scss
│       └── criteria-tree/                     ← sub-component: visual criteria tree
└── ... (UI Dev Kit base)
```

### Template components to keep

| Component | Why |
|---|---|
| `generic-dialog/` | Confirmation dialogs |
| `oauth-dialog/` | Auth flow |
| `services/` | Electron IPC bridge |
| `theme-picker/` | Dark/light mode |
| `sailpoint-sdk.service.ts` | ISC API wrapper |

All other example components (`accounts/`, `certification-management/`, `colab/`, `config-hub/`, `cronicle/`, `identities/`, `owner-graph/`, `report-example/`, `saas-connectivity-creator/`, `velocity-editor-dialog/`, `attach-rule/`) will be removed.

---

## ISC SDK calls needed

| SDK method | Purpose |
|---|---|
| `sdk.listRoles({ filters, limit, offset })` | Paginated role fetch with name filter |
| `sdk.getRole({ id })` | Full role detail including membership/criteria |
| `sdk.patchRole({ id, requestBody })` | Apply JSON Patch to role membership |

No backend changes needed — all calls go through Electron's IPC bridge directly to ISC, the same pattern used by the existing `transforms` component.

---

## UI flow

Single page, four panels progressing left to right (or a stepper).

### Panel 1 — Target roles

- Radio: **Single** (exact name match) / **Bulk** (contains filter)
- Text input + "Find Roles" button
- Results table: name, id, membership type, criteria node count
- Checkbox selection for bulk; single-role mode auto-selects

### Panel 2 — Operation (tabs)

| Tab | Fields |
|---|---|
| **Update value** | Attribute · Old value · New value(s) |
| **Add value(s)** | Attribute · Value(s) to append |
| **Add block** | Attribute · Operation (EQUALS / NOT_EQUALS / CONTAINS / STARTS_WITH / ENDS_WITH) · Value(s) · Join with AND / OR |
| **Remove** | Attribute · Remove specific value OR entire attribute |
| **Consolidate** | Attribute |

Attribute field on each tab should autocomplete from the leaf nodes of the fetched role's current criteria tree — prevents typos and surfaces what attributes are actually present.

### Panel 3 — Preview

- Computed criteria diff per role displayed as an Angular Material tree (`mat-tree`)
- **Dry-run toggle** (default ON — safe-by-default, matches the script)
- **Snapshot toggle** (default ON — saves pre-run membership JSON)
- "Execute" button enabled only when dry-run is OFF
- Before executing, the snapshot is saved via `dialog.showSaveDialog` so the user picks the location

### Panel 4 — Results

- Per-role status list: Updated / Skipped (with reason) / Error (with ISC error detail)
- Snapshot download button if auto-save wasn't triggered
- "Run again" button — resets to Panel 2 with the same role selection

---

## Open questions (decide before building)

1. **Criteria tree viz** — `mat-tree` (recommended, matches kit style) or indented text?
2. **Attribute autocomplete** — from fetched role criteria (recommended) or free-text only?
3. **Snapshot save** — always prompt via `dialog.showSaveDialog`, or auto-save to `~/Downloads/`?
4. **Release artifacts** — signed installers or unsigned builds for now?

---

## GitHub Actions (planned)

On each release tag:
- Build Electron for Windows (`.exe`), macOS (`.dmg`), Linux (`.AppImage`)
- Attach artifacts to the GitHub Release

On each PR:
- TypeScript typecheck
- Angular build check

---

## Getting started (once scaffolded)

```bash
git clone https://github.com/rlwillen0121/isc-role-criteria-manager.git
cd isc-role-criteria-manager
npm install
npm run build:components
npm start           # launches Electron in dev mode
```

For the PowerShell script only — no Node/npm needed, just run:

```powershell
./scripts/ISC-Update-Roles-Criteria.ps1
```
