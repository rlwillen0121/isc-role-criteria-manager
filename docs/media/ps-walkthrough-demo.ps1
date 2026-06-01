#Requires -Version 4.0
<#
.SYNOPSIS
    Demo script for VHS terminal recording.

.DESCRIPTION
    Simulates Invoke-ISCRoleCriteriaManager.ps1 with sandbox placeholder data.
    No real API calls are made. Run with -WhatIf to match the production dry-run flow.

    This script is only used for generating docs/media/ps-walkthrough.gif.
    Do not commit credentials or real tenant data.

.EXAMPLE
    pwsh scripts/ps-walkthrough-demo.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'

# ── Connection ────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '=================================================' -ForegroundColor Cyan
Write-Host '   ISC Role Criteria Manager' -ForegroundColor Cyan
Write-Host '=================================================' -ForegroundColor Cyan
Write-Host ''

Write-Host 'Enter your ISC tenant URL (either form is accepted):' -ForegroundColor Cyan
Write-Host '  https://acme.identitynow.com' -ForegroundColor Green
Write-Host '  https://acme.api.identitynow.com' -ForegroundColor Green
Write-Host ''
Write-Host 'Tenant URL: ' -ForegroundColor Cyan -NoNewline
$TenantUrl = ([Console]::ReadLine()).Trim()

# Normalize — insert .api. if absent
$TenantUrl = $TenantUrl.TrimEnd('/')
if ($TenantUrl -notmatch '^https?://') { $TenantUrl = "https://$TenantUrl" }
if ($TenantUrl -match '^(https://[^.]+)\.(identitynow(?:-demo)?\.com)') {
    $TenantUrl = "$($Matches[1]).api.$($Matches[2])"
    Write-Host "  URL normalized to API format: $TenantUrl" -ForegroundColor Yellow
}

Write-Host 'Acquiring token via OAuth2 client credentials...' -ForegroundColor Cyan
Start-Sleep -Milliseconds 1100
Write-Host 'Token acquired (expires in 3600s).' -ForegroundColor Green
Write-Host 'Token org verified: sandbox' -ForegroundColor Green
Write-Host ''

# ── STEP 1: Target ────────────────────────────────────────────────────────────
Write-Host 'STEP 1 — Target' -ForegroundColor Cyan
Write-Host '  [S] Single role (exact name)'
Write-Host '  [B] Bulk (role name contains)'
Write-Host '  [C] Find by criteria  (attribute/operation/value filter across all roles)'
Write-Host '  [A] Find by access profile or entitlement'
Write-Host ''
Write-Host 'Select target mode: ' -ForegroundColor Cyan -NoNewline
$targetMode = ([Console]::ReadLine()).Trim().ToUpper()

Write-Host ''
Write-Host 'Name contains: ' -ForegroundColor Cyan -NoNewline
$partial = ([Console]::ReadLine()).Trim()

Write-Host ''
Write-Host "Fetching roles (name contains '$partial')..." -ForegroundColor DarkGray
Start-Sleep -Milliseconds 900

$targetRoles = @(
    [pscustomobject]@{
        id         = 'a1b2c3d4-0001-0001-0001-000000000001'
        name       = 'ACME Birthright Users'
        membership = [pscustomobject]@{
            type     = 'RULE'
            criteria = [pscustomobject]@{
                operation   = 'EQUALS'
                key         = [pscustomobject]@{ type = 'IDENTITY'; property = 'cloudLifecycleState' }
                stringValue = 'active'
            }
        }
    }
    [pscustomobject]@{
        id         = 'a1b2c3d4-0002-0002-0002-000000000002'
        name       = 'ACME Contractors'
        membership = [pscustomobject]@{
            type     = 'RULE'
            criteria = [pscustomobject]@{
                operation   = 'AND'
                children    = @(
                    [pscustomobject]@{
                        operation   = 'EQUALS'
                        key         = [pscustomobject]@{ type = 'IDENTITY'; property = 'cloudLifecycleState' }
                        stringValue = 'active'
                    }
                    [pscustomobject]@{
                        operation   = 'EQUALS'
                        key         = [pscustomobject]@{ type = 'IDENTITY'; property = 'department' }
                        stringValue = 'Contractors'
                    }
                )
            }
        }
    }
)

Write-Host "Found $($targetRoles.Count) role(s):" -ForegroundColor Cyan
$targetRoles | ForEach-Object { Write-Host "  $($_.name)  [$($_.id)]" -ForegroundColor White }

Write-Host ''
Write-Host "Roles selected ($($targetRoles.Count)):" -ForegroundColor Cyan
$targetRoles | ForEach-Object { Write-Host "  $($_.name)" -ForegroundColor White }

# ── STEP 2: Operation ─────────────────────────────────────────────────────────
Write-Host ''
Write-Host 'STEP 2 — Operation' -ForegroundColor Cyan
Write-Host '  [U] Update    — replace old value with new value(s)'
Write-Host '  [V] Add Values— append value(s) to first matching leaf'
Write-Host '  [A] Add Block — insert a new criteria leaf (AND/OR join)'
Write-Host '  [R] Remove    — remove a value or entire attribute'
Write-Host '  [C] Consolidate — merge sibling OR leaves (same attribute + operator)'
Write-Host '  [X] Restore   — revert to a saved snapshot'
Write-Host ''
Write-Host 'Select operation: ' -ForegroundColor Cyan -NoNewline
$opChoice = ([Console]::ReadLine()).Trim().ToUpper()

Write-Host ''
# Attribute prompt — matching real script
Write-Host 'Attribute (e.g. cloudLifecycleState): ' -ForegroundColor Green -NoNewline
$rawAttr = ([Console]::ReadLine()).Trim()
# Strip optional 'attribute.' prefix
$attribute = $rawAttr -ireplace '^attribute\.', ''

Write-Host '  Enter ONE value to match (to add values use [V]; to drop a value use [R]).' -ForegroundColor Yellow
Write-Host 'Old value to match: ' -ForegroundColor Green -NoNewline
$oldValue = ([Console]::ReadLine()).Trim()
Write-Host 'New value(s), comma-separated: ' -ForegroundColor Green -NoNewline
$newRaw = ([Console]::ReadLine()).Trim()
$newValues = @($newRaw -split ',\s*' | Where-Object { $_ -ne '' })

# ── STEP 3: Preview ───────────────────────────────────────────────────────────
Write-Host ''
Write-Host 'STEP 3 — Preview' -ForegroundColor Cyan
Write-Host 'Computing changes...' -ForegroundColor DarkGray
Start-Sleep -Milliseconds 600

# Role 1 — single EQUALS leaf, will change
Write-Host ''
Write-Host "  Role: $($targetRoles[0].name)" -ForegroundColor White
Write-Host '    Status : WILL CHANGE' -ForegroundColor Green
Write-Host '    Before:' -ForegroundColor DarkGray
Write-Host "      $attribute EQUALS $oldValue" -ForegroundColor White
Write-Host '    After:' -ForegroundColor DarkGray
Write-Host "      $attribute EQUALS $($newValues[0])" -ForegroundColor White
Write-Host '    Identities: ' -ForegroundColor DarkGray -NoNewline
Start-Sleep -Milliseconds 700
Write-Host '142 -> 89  (-53)' -ForegroundColor Yellow

# Role 2 — AND block, one child will change
Write-Host ''
Write-Host "  Role: $($targetRoles[1].name)" -ForegroundColor White
Write-Host '    Status : WILL CHANGE' -ForegroundColor Green
Write-Host '    Before:' -ForegroundColor DarkGray
Write-Host "      [AND]" -ForegroundColor Cyan
Write-Host "        $attribute EQUALS $oldValue" -ForegroundColor White
Write-Host "        department EQUALS Contractors" -ForegroundColor White
Write-Host '    After:' -ForegroundColor DarkGray
Write-Host "      [AND]" -ForegroundColor Cyan
Write-Host "        $attribute EQUALS $($newValues[0])" -ForegroundColor White
Write-Host "        department EQUALS Contractors" -ForegroundColor White
Write-Host '    Identities: ' -ForegroundColor DarkGray -NoNewline
Start-Sleep -Milliseconds 600
Write-Host '37 -> 22  (-15)' -ForegroundColor Yellow

Write-Host ''
Write-Host 'Preview summary: 2 role(s) will change, 0 will be skipped.' -ForegroundColor Cyan

# ── STEP 4: Apply (WhatIf) ───────────────────────────────────────────────────
Write-Host ''
Write-Host 'STEP 4 — Apply' -ForegroundColor Cyan

if (-not $PSCmdlet.ShouldProcess("2 role(s)", "PATCH membership criteria")) {
    Write-Host '[WhatIf] No changes written.' -ForegroundColor DarkCyan
    Write-Host "  [WhatIf] $($targetRoles[0].name) — patch: [{`"op`":`"replace`",`"path`":`"/membership/criteria/stringValue`",`"value`":`"$($newValues[0])`"}]" -ForegroundColor DarkCyan
    Write-Host "  [WhatIf] $($targetRoles[1].name) — patch: [{`"op`":`"replace`",`"path`":`"/membership/criteria/children/0/stringValue`",`"value`":`"$($newValues[0])`"}]" -ForegroundColor DarkCyan
}

Write-Host ''
