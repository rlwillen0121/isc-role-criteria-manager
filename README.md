# isc-role-criteria-manager

> **Unofficial community tool — not affiliated with, sponsored by, or endorsed by SailPoint Technologies, Inc.**
> SailPoint and Identity Security Cloud (ISC) are trademarks of SailPoint Technologies, Inc., used here
> solely to describe the product this tool integrates with.

A community tool for bulk-managing SailPoint Identity Security Cloud (ISC) role membership criteria.

Two ways to use it — pick what fits your workflow:

| | Electron app | PowerShell scripts |
|---|---|---|
| **Requires** | Node 20+, npm | PowerShell 4.0+ |
| **Auth** | OAuth2 or PAT (via system keychain) | OAuth2 client credentials or bearer token |
| **Best for** | Interactive bulk editing with visual diff | Automation, CI/CD, headless environments |

---

## Before you run: safety checklist

This tool writes bulk `PATCH` operations to a live ISC tenant. The following built-in rails exist to protect you — **use them**:

| Rail | How to use it |
|---|---|
| **Dry-run / preview** | Electron: review the side-by-side diff before clicking Apply. PowerShell: pass `-WhatIf` to either script to print all planned changes with no API writes. |
| **Test in a sandbox first** | Run against a non-production ISC tenant before touching production roles. |
| **Automatic pre-run snapshot** | Every Apply (Electron and PowerShell) saves a timestamped JSON snapshot of every matched role's membership *before* writing. |
| **Restore from Snapshot** | Use the Electron "Restore from Snapshot" action or the PowerShell `X` operation to revert any subset of roles to a prior state from a saved snapshot. |

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

#### Simulate

Click **Simulate** in the Operation step to dry-run the operation against every **selected** role (the button shows the exact count: *Simulate (N roles)*). Results show how many roles would change and how many would be skipped with skip reasons — no API writes.

#### Preview

Before writing anything, the app shows a side-by-side before/after criteria tree for every selected role, plus live identity counts (before and after) fetched from the ISC Search API. Counts use the corrected `attributes.<name>` prefix and operation-aware Elasticsearch terms, so they reflect real identity matches even for custom attributes.

#### Attribute names — `attribute.` prefix is optional

Everywhere you type an IDENTITY attribute name (Operation forms, Find by criteria filter), the `attribute.` prefix is accepted but not required. `cloudLifecycleState` and `attribute.cloudLifecycleState` are treated as the same attribute throughout.

#### Apply

- Saves a timestamped JSON snapshot of every matched role's membership before writing
- Applies RFC-6902 JSON Patch operations via `PATCH /v3/roles/{id}`
- Shows per-role status (Updated / Skipped / Error) with ISC error detail on failure
- **Restore from Snapshot** — reload a previous snapshot and revert any subset of roles to their prior state
- **Start Over** — full reset of all four steps (Target, Operation, Preview, Results); distinct from **Run again**, which keeps your target selection and jumps back to the Operation step

### Authentication & trust model

**PAT (Personal Access Token)** authentication is fully local. The client ID and secret are stored in the OS keychain via Electron's `safeStorage` API and are never sent anywhere except directly to your ISC tenant's token endpoint.

**OAuth** authentication uses a SailPoint-operated AWS Lambda broker (`https://nug87yusrg.execute-api.us-east-1.amazonaws.com/Prod/sailapps`). The flow works as follows:

1. The app generates an ephemeral RSA key pair in memory and sends your tenant name and the ephemeral public key to the broker.
2. The broker initiates the OAuth authorization code + PKCE flow with your ISC tenant and returns a browser URL. Your browser opens and you log in directly with SailPoint.
3. The broker receives the authorization code from SailPoint, exchanges it for tokens, encrypts the token payload using the ephemeral public key you provided, and holds it for pickup.
4. The app polls the broker for the encrypted token, decrypts it locally using the in-memory private key (which is cleared immediately after use), and stores the resulting tokens in the OS keychain via `safeStorage`.

Subsequent API calls go directly from the Electron app to your ISC tenant. Token refresh also goes through the broker (`/auth/refresh`): the app sends the refresh token + tenant URL and receives a new access/refresh token pair.

**What the broker sees:** your tenant name, your ISC API base URL, and the OAuth tokens during the brief exchange window. It does not see your PAT credentials.

If you prefer zero third-party involvement, use PAT auth instead.

### Screenshots & walkthroughs

> Full step-by-step walkthrough with all screenshots: **[docs/USAGE.md](docs/USAGE.md)**

**Target — four modes for finding roles**

![Target modes](docs/media/target-modes.gif)

**Operations — five criteria-editing actions**

![Operations](docs/media/operations.gif)

**Preview → Apply → Restore**

![Apply and Restore](docs/media/apply-restore.gif)

**PowerShell walkthrough — Target → Operation → Preview → `WhatIf`**

*Illustrative walkthrough of the script's four-step flow with placeholder sandbox data.*

![PowerShell walkthrough](docs/media/ps-walkthrough.gif)

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

**Tenant URL** — either form is accepted. If you supply the base URL (`https://acme.identitynow.com`) the script automatically inserts the `.api.` segment (`https://acme.api.identitynow.com`). Both scripts validate the JWT org claim against the tenant URL on startup to catch copy-paste token errors.

**Compatibility** — requires PowerShell 4.0 or later. TLS 1.2 is enabled automatically, so no manual `[Net.ServicePointManager]` configuration is needed.

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

Attribute names accept the `attribute.` prefix or bare names interchangeably — `cloudLifecycleState` and `attribute.cloudLifecycleState` both work everywhere.

**Preview step:** Computes and displays before/after criteria trees for every matched role before prompting to apply, plus an **identity-impact preview** — before/after identity match counts fetched live from the ISC Search API (`POST /v2025/search/count`), with a signed delta, so you can see how many identities each change adds or removes before writing. Counts use `attributes.<name>` prefix and operation-aware terms for accurate results on custom attributes.

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
