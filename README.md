# isc-role-criteria-manager

A tool for bulk-managing SailPoint Identity Security Cloud (ISC) role membership criteria.

Two ways to use it — pick what fits your workflow:

| | PowerShell script | Electron app *(coming soon)* |
|---|---|---|
| **Requires** | PowerShell 5.1+ | Node 18+, npm |
| **Auth** | OAuth2 client credentials or bearer token | OAuth2 or PAT (via system keychain) |
| **Best for** | Automation, CI/CD, headless environments | Interactive bulk editing with visual diff |

---

## PowerShell script

`scripts/ISC-Update-Roles-Criteria.ps1` — no install required.

### Usage

```powershell
# Option 1 — OAuth2 client credentials (automatic token)
$env:ISC_TENANT_URL    = "https://acme.api.identitynow.com"
$env:ISC_CLIENT_ID     = "your-client-id"
$env:ISC_CLIENT_SECRET = "your-client-secret"
./scripts/ISC-Update-Roles-Criteria.ps1

# Option 2 — pre-acquired bearer token
$env:ISC_TENANT_URL   = "https://acme.api.identitynow.com"
$env:ISC_BEARER_TOKEN = "<your-token>"
./scripts/ISC-Update-Roles-Criteria.ps1

# Option 3 — interactive (prompts for URL and token)
./scripts/ISC-Update-Roles-Criteria.ps1

# Dry run — preview changes without writing to ISC
./scripts/ISC-Update-Roles-Criteria.ps1 -WhatIf
```

### Operations

| Key | Operation |
|---|---|
| `U` | Update an existing criteria value (old → new) |
| `V` | Add value(s) to an existing criteria node |
| `A` | Add a new criteria block (AND or OR) |
| `R` | Remove a specific value or an entire attribute |
| `C` | Consolidate sibling OR nodes for the same attribute into one |

Each run takes a pre-run snapshot of all matched roles' membership and saves it as a timestamped JSON file — use it to roll back if needed.

---

## Electron app *(in progress)*

A desktop GUI built on the [SailPoint UI Development Kit](https://github.com/sailpoint-oss/ui-development-kit) (Angular 19 + Electron).

See [PLAN.md](./PLAN.md) for the full implementation plan.

---

## Contributing

Contributions welcome. Please open an issue first for significant changes.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-thing`)
3. Commit your changes
4. Open a pull request

## License

MIT
