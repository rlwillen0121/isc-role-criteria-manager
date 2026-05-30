# Architecture — ISC Role Criteria Manager

This document describes the architecture of the built application.

---

## Stack

- **Framework**: [SailPoint UI Development Kit](https://github.com/sailpoint-oss/ui-development-kit) (Angular 19 + Electron)
- **UI components**: Angular Material (`mat-stepper`, `mat-table`, `mat-tabs`, `mat-tree`, `mat-autocomplete`)
- **ISC SDK**: `sailpoint-api-client` (pre-wired in the UI Dev Kit)
- **Auth**: OAuth2 (browser flow) or PAT — handled by the kit's built-in environment manager
- **Distribution**: Cross-platform Electron builds via `electron-builder`

---

## Repo structure

```
isc-role-criteria-manager/
├── scripts/
│   ├── ISC-Update-Roles-Criteria.ps1          ← original single-step script
│   └── Invoke-ISCRoleCriteriaManager.ps1      ← full-featured companion (feature parity with app)
├── projects/sailpoint-components/src/lib/
│   └── role-criteria-manager/
│       ├── role-criteria-manager.component.ts   ← main orchestration component
│       ├── role-criteria-manager.component.html ← four-step stepper UI
│       ├── role-criteria-manager.component.scss
│       ├── criteria-tree/                       ← visual criteria tree sub-component
│       └── models/
│           ├── criteria.model.ts                ← pure data model + tree utilities
│           └── criteria-operations.ts           ← pure mutation engine (all 5 operations)
└── ... (UI Dev Kit base)
```

---

## ISC SDK calls

| SDK method | Purpose |
|---|---|
| `sdk.listRoles({ filters, limit, offset })` | Paginated role fetch (250/page) with optional name filter |
| `sdk.getRole({ id })` | Full role detail including membership/criteria |
| `sdk.patchRole({ id, requestBody })` | Apply RFC-6902 JSON Patch to role membership |
| `sdk.listIdentityAttributes()` | Populate attribute autocomplete in Find by criteria |
| `sdk.listAccessProfiles({ limit })` | Populate autocomplete in Find by access profile |
| `sdk.listEntitlements({ limit })` | Populate autocomplete in Find by entitlement |
| `sdk.searchCount({ query })` | Identity count before/after in Preview panel |

All calls go through Electron's IPC bridge (`SailPointSDKService`) directly to ISC.

---

## UI flow — four-step stepper

### Step 1 — Target

Four modes for selecting the roles to operate on:

| Mode | Mechanism |
|---|---|
| **Single** | `name eq "..."` filter — auto-clamps to first result for safety |
| **Bulk** | `name co "..."` filter |
| **Find by criteria** | Fetch all roles, filter client-side by attribute/operator/value against `membership.criteria` |
| **Find by access profile / entitlement** | Fetch all roles, filter by `accessProfiles[].name` or `entitlements[].name` |

Attribute field in Find-by-criteria mode autocompletes from `listIdentityAttributes` (lazy-loaded on focus). Access profile / entitlement name field autocompletes from `listAccessProfiles` / `listEntitlements`.

Large result sets (>1000 roles) prompt for confirmation before continuing the fetch.

### Step 2 — Operation

Five tabs, each a pure form with autocomplete from the fetched roles' existing criteria attributes:

| Tab | Parameters |
|---|---|
| **Update** | Attribute · Old value (dropdown from live criteria) · New value(s) |
| **Add Values** | Attribute · Value(s) to append |
| **Add Block** | Key type (IDENTITY / ACCOUNT / ENTITLEMENT) · Source ID (required for ACCOUNT/ENTITLEMENT) · Attribute · Comparison · Value(s) · Join (AND / OR) |
| **Remove** | Attribute · Mode (specific value or entire attribute) · Value |
| **Consolidate** | Attribute |

### Step 3 — Preview

- Per-role before/after criteria tree rendered via `criteria-tree` sub-component
- Live identity counts (before/after) fetched from ISC Search API, non-blocking
- Simulation mode: count how many roles would change vs. be skipped without computing full diffs
- Snapshot toggle (default ON) and dry-run toggle

### Step 4 — Results

- Pre-run snapshot saved as timestamped JSON before any writes
- `PATCH /v3/roles/{id}` applied per role with RFC-6902 patch array
- Per-role status: Updated / Skipped (with reason) / Error (with ISC error detail)
- **Restore from Snapshot**: load a previous snapshot file and revert any subset of roles

---

## Criteria model (`criteria.model.ts`)

Pure, Angular-free model. No I/O.

A role's membership selector contains a single root `CriteriaNode`:
- **Composite**: `{ operation: 'AND' | 'OR', children: [...] }`
- **Leaf**: `{ operation: LeafOperation, key: CriteriaKey, stringValue? | values? }`

**Key invariant:** a leaf holds its value in exactly one field:
- 1 value → `stringValue`, `values` absent
- 2+ values → `values[]`, `stringValue` absent

`applyValueInvariant()` enforces this after every mutation.

`CriteriaKey` shape: `{ type: 'IDENTITY' | 'ACCOUNT' | 'ENTITLEMENT', property: string, sourceId?: string }`. `sourceId` is required for ACCOUNT and ENTITLEMENT types.

---

## Operations engine (`criteria-operations.ts`)

Pure mutation engine — deterministic transforms over plain objects, no Angular, no SDK.

Each function takes a `MembershipSelector` plus parameters and returns an `OperationResult`:
- `status: 'ready' | 'skipped'`
- `tree`: resulting criteria tree (`null` = criteria removed entirely)
- `patch`: RFC-6902 JSON Patch array ready to send to `patchRole`

The whole `/membership` object is always patched as a unit:
- `add` when no membership existed
- `replace` when membership existed
- `remove` when all criteria are removed

### Operation behaviour

**Update** — walks all leaves; replaces values on every leaf where `key.property === attribute` and current values contain `oldValue`.

**Add Values** — depth-first; stops at the *first* matching leaf and appends de-duplicated values.

**Add Block** — builds a new leaf; if root is a composite with matching join op, appends to children; otherwise wraps both in a new composite.

**Remove** — rebuilds tree bottom-up; collapses empty composites and single-child composites.

**Consolidate** — merges sibling OR leaves for the same attribute that share the *same comparison operator*. Leaves with different operators are left untouched to preserve membership semantics.

---

## PowerShell parity

`Invoke-ISCRoleCriteriaManager.ps1` mirrors all of the above:
- Same four target modes (Find by criteria and Find by access/entitlement fetch all roles and filter client-side)
- Same five operations with identical semantics (including the same-operator-only consolidate rule and first-leaf-only add-values behaviour)
- Preview step shows before/after criteria trees in the console before prompting to apply
- Snapshot save/restore using the same JSON schema as the Electron app

`-WhatIf` suppresses all API writes and prints the patch body that would have been sent.
