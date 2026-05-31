# isc-role-criteria-manager — Electron App Walkthrough

> Screenshots and walkthroughs captured against the devrel ISC sandbox.
> All Apply operations shown here used the dry-run safety rail or were
> immediately restored from a pre-run snapshot.

---

## Contents

1. [Connect / Authenticate](#1-connect--authenticate)
2. [Target — choose which roles to edit](#2-target--choose-which-roles-to-edit)
3. [Operations — five ways to modify criteria](#3-operations--five-ways-to-modify-criteria)
4. [Simulate — estimate impact before committing](#4-simulate--estimate-impact-before-committing)
5. [Preview — before/after diff + identity counts](#5-preview--beforeafter-diff--identity-counts)
6. [Apply → Results](#6-apply--results)
7. [Restore from Snapshot](#7-restore-from-snapshot)

---

## 1. Connect / Authenticate

The app opens to the home screen. Click **Connect to Environment** to authenticate using the configured credentials (OAuth2 or PAT stored in the system keychain).

![Connect screen](media/00-connect-screen.png)

After a successful connection the dashboard loads, showing tenant summary cards.

![Dashboard connected](media/01-dashboard-connected.png)

> **Auth & walkthroughs GIF**
> ![auth-flow](media/auth-flow.gif)

Navigate to **Role Criteria Manager** via the sidebar or the shortcut card on the dashboard.

---

## 2. Target — choose which roles to edit

The Target step lets you find the role(s) you want to modify. Four modes are available:

### Single role (exact name match)

Safe for one-off edits. Enter the exact role name and click **Find Roles**.

![Single role mode](media/02-target-single-mode.png)
![Single role filled](media/03-target-single-filled.png)

### Bulk (name contains)

Substring search across all roles in the tenant. Roles whose names contain the filter text are returned and auto-selected (up to 50).

![Bulk mode](media/04-target-bulk-mode.png)

### Find by criteria

Filter roles whose membership criteria contain a specific attribute, operator, and/or value. The attribute field autocompletes from live ISC identity attributes.

![Find by criteria mode](media/05-target-criteria-mode.png)

### Find by access profile / entitlement

Filter roles that grant a specific access profile or entitlement (name-contains). Autocompletes from live ISC data.

![Find by access profile mode](media/06-target-access-profile-mode.png)

### Search results table

After clicking **Find Roles**, matching roles appear in a table with their membership type and criteria node count. Select the roles you want to edit, then click **Next**.

![Bulk results table](media/07-target-bulk-results-table.png)

> **Target modes GIF** — all four modes and a bulk results table
> ![target-modes](media/target-modes.gif)

---

## 3. Operations — five ways to modify criteria

Once you've selected roles and moved to the **Operation** step, choose one of five operation types from the tab group.

### Update value

Replace an old criteria value with one or more new values across every matching leaf for that attribute.

![Operation: Update](media/08-operation-update.png)

### Add value(s)

Append values to the first existing leaf for an attribute (converts `stringValue` → `values[]` automatically).

![Operation: Add values](media/09-operation-add-values.png)

### Add block

Insert a new criteria leaf. Supports IDENTITY, ACCOUNT, and ENTITLEMENT key types. ACCOUNT and ENTITLEMENT require a Source ID.

![Operation: Add block](media/10-operation-add-block.png)

### Remove

Remove a specific value from a leaf, or delete all leaves for an attribute entirely.

![Operation: Remove](media/11-operation-remove.png)

### Consolidate

Merge sibling OR leaves for the same attribute into a single multi-value leaf (same comparison operator only).

![Operation: Consolidate](media/12-operation-consolidate.png)

> **Operations GIF** — cycling through all five operation tabs
> ![operations](media/operations.gif)

---

## 4. Simulate — estimate impact before committing

Click **Simulate** in the Operation step to run a dry evaluation against all selected roles — no writes. The simulation card shows how many roles would change and how many would be skipped (with skip reasons).

![Simulate results](media/13-simulate-results.png)

---

## 5. Preview — before/after diff + identity counts

Click **Preview** to move to the Preview step. For each selected role:
- A **side-by-side criteria tree** (Current vs. Proposed) shows exactly what will change.
- **Identity counts** (fetched from the ISC Search API) show how many identities match before and after.

![Preview — criteria tree](media/14-preview-criteria-tree.png)
![Preview — identity counts](media/15-preview-identity-counts.png)

**Dry run is on by default.** The Execute button is disabled while dry run is on — toggle it off only when you're ready to write to the tenant.

> **Preview + Simulate GIF**
> ![preview-simulate](media/preview-simulate.gif)

---

## 6. Apply → Results

When ready to write:

1. Optionally keep **Save snapshot before writing** toggled on (recommended — saves a JSON backup of every matched role's criteria before patching).
2. Toggle **Dry run** off.
3. Click **Execute**.
4. Confirm the action in the dialog.

![Ready to execute (dry run off)](media/16-preview-ready-to-execute.png)
![Confirm dialog](media/17-apply-confirm-dialog.png)

The Results step shows per-role status (`Updated` / `Skipped` / `Error`) with live node-count verification after each patch.

![Apply results](media/18-apply-results.png)

---

## 7. Restore from Snapshot

If you need to revert changes, click **Restore from Snapshot** in the Results step (or the Target step). Select the JSON snapshot file saved before your last run. The app fetches the current state of each role, computes a reverse patch, and shows a before/after preview.

![Restore preview](media/19-restore-preview.png)

Confirm and execute the restore — the roles are patched back to their snapshot state. The Results step shows the restoration outcome.

![Restore complete](media/21-restore-complete.png)

> **Apply + Restore GIF** — full flow from ready-to-execute through sandbox cleanup
> ![apply-restore](media/apply-restore.gif)
