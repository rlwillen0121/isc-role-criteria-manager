# isc-role-criteria-manager

A tool for bulk-managing SailPoint Identity Security Cloud (ISC) role membership criteria.

Two ways to use it — pick what fits your workflow:

| | Electron app | PowerShell scripts |
|---|---|---|
| **Requires** | Node 20+, npm | PowerShell 5.1+ |
| **Auth** | OAuth2 or PAT (via system keychain) | OAuth2 client credentials or bearer token |
| **Best for** | Interactive bulk editing with visual diff | Automation, CI/CD, headless environments |

---

## Electron app

### Quick start

```bash
git clone https://github.com/rlwillen0121/isc-role-criteria-manager.git
cd isc-role-criteria-manager
npm install
npm run build:components
npm start           # launches Electron in dev mode
```

### Features

#### Target — four ways to find the roles you want to edit

| Mode | How it works |
|---|---|
| **Single role** | Exact name match — safe for one-off edits |
| **Bulk (name contains)** | Substring match across all roles |
| **Find by criteria** | Filter roles whose membership criteria contain a specific attribute, operator, and/or value. Attribute field autocompletes from live ISC identity attributes. |
| **Find by access profile / entitlement** | Filter roles that grant a specific access profile or entitlement (name-contains). Autocompletes from live ISC data. |

#### Operations — five ways to modify criteria

| Tab | What it does |
|---|---|
| **Update** | Replace an old value with one or more new values on every matching leaf |
| **Add Values** | Append values to the first leaf for an attribute (converts `stringValue` → `values[]`) |
| **Add Block** | Insert a new criteria leaf — supports IDENTITY, ACCOUNT, and ENTITLEMENT key types; ACCOUNT/ENTITLEMENT require a Source ID |
| **Remove** | Remove a specific value or delete all leaves for an attribute |
| **Consolidate** | Merge sibling OR leaves for the same attribute into a single multi-value leaf |

#### Preview

Before writing anything, the app shows a side-by-side before/after criteria tree for every selected role, plus live identity counts (before and after) fetched from the ISC Search API.

#### Apply

- Saves a timestamped JSON snapshot of every matched role's membership before writing
- Applies RFC-6902 JSON Patch operations via `PATCH /v3/roles/{id}`
- Shows per-role status (Updated / Skipped / Error) with ISC error detail on failure
- **Restore from Snapshot** — reload a previous snapshot and revert any subset of roles to their prior state

---

## PowerShell scripts

Both scripts share the same authentication model:

```powershell
# OAuth2 client credentials (automatic token fetch)
$env:ISC_TENANT_URL    = "https://acme.api.identitynow.com"
$env:ISC_CLIENT_ID     = "your-client-id"
$env:ISC_CLIENT_SECRET = "your-client-secret"

# — or — pre-acquired bearer token
$env:ISC_TENANT_URL   = "https://acme.api.identitynow.com"
$env:ISC_BEARER_TOKEN = "<your-token>"

# — or — leave unset and paste interactively when prompted
```

Both scripts validate the JWT org claim against the tenant URL on startup to catch copy-paste token errors.

### `Invoke-ISCRoleCriteriaManager.ps1` — full-featured companion

Full feature parity with the Electron app. Four-step interactive workflow: Target → Operation → Preview → Apply.

```powershell
./scripts/Invoke-ISCRoleCriteriaManager.ps1

# Dry run — preview all changes, no API writes
./scripts/Invoke-ISCRoleCriteriaManager.ps1 -WhatIf
```

**Target modes:** Single / Bulk / Find by criteria / Find by access profile or entitlement

**Operations:**

| Key | Operation |
|---|---|
| `U` | Update an existing criteria value (old → new) |
| `V` | Add value(s) to an existing criteria leaf |
| `A` | Add a new criteria block (IDENTITY / ACCOUNT / ENTITLEMENT key types, AND or OR join) |
| `R` | Remove a specific value or an entire attribute |
| `C` | Consolidate sibling OR leaves for the same attribute (same comparison operator only) |
| `X` | Restore roles from a saved snapshot file |

**Preview step:** Computes and displays before/after criteria trees for every matched role before prompting to apply.

**Snapshot:** Automatically saves a pre-run snapshot before writing; `X` operation restores from any saved snapshot.

### `ISC-Update-Roles-Criteria.ps1` — original script

Simpler, single-step version. No preview step or find-by-criteria targeting. Suitable for quick scripted runs where you know exactly which roles to target by name.

```powershell
./scripts/ISC-Update-Roles-Criteria.ps1

./scripts/ISC-Update-Roles-Criteria.ps1 -WhatIf
```

Supports the same five operations (U / V / A / R / C) and saves a pre-run snapshot automatically.

---

## Snapshot format

Both the Electron app and the PowerShell scripts use the same snapshot JSON schema:

```json
[
  {
    "id": "<role-id>",
    "name": "<role-name>",
    "membership": { ... }
  }
]
```

Snapshots are interchangeable — a snapshot saved by the Electron app can be restored via the PowerShell `X` operation, and vice versa.

---

## Contributing

Contributions welcome. Please open an issue first for significant changes.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-thing`)
3. Commit your changes
4. Open a pull request

## License

MIT
