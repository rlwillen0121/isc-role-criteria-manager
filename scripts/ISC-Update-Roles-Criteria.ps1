# =============================================================================
# ISC-bulk-update-role-criteria.ps1
#
# Bulk-updates ISC role membership criteria via the /v3/roles PATCH API.
# Supports PS 5.1 and PS 7+.
#
# Features:
#   - Five operations: Update value, Add value(s), Add block, Remove, Consolidate
#   - Paginated role fetch (up to 250 per page)
#   - Pre-run membership snapshot for rollback
#   - Dry-run via -WhatIf
#   - Per-role result summary
#
# USAGE:
#   # Option 1 — OAuth2 client credentials (fully automatic, no token paste needed)
#   $env:ISC_TENANT_URL    = "https://acme.api.identitynow.com"
#   $env:ISC_CLIENT_ID     = "your-client-id"
#   $env:ISC_CLIENT_SECRET = "your-client-secret"
#   ./ISC-bulk-update-role-criteria.ps1
#
#   # Option 2 — pre-acquired bearer token via env var
#   $env:ISC_TENANT_URL   = "https://acme.api.identitynow.com"
#   $env:ISC_BEARER_TOKEN = "<your-token>"
#   ./ISC-bulk-update-role-criteria.ps1
#
#   # Option 3 — interactive (prompts for URL then token paste)
#   ./ISC-bulk-update-role-criteria.ps1
#
#   # Dry run (previews changes, no API writes)
#   ./ISC-bulk-update-role-criteria.ps1 -WhatIf
# =============================================================================

#Requires -Version 5.1

[CmdletBinding(SupportsShouldProcess)]
param (
    # ISC tenant base URL — e.g. https://acme.api.identitynow.com
    # Required. Set via ISC_TENANT_URL env var or pass -TenantUrl directly.
    [string]$TenantUrl    = $env:ISC_TENANT_URL,

    # OAuth2 client credentials — if both are set, a token is fetched automatically.
    # Set via ISC_CLIENT_ID / ISC_CLIENT_SECRET env vars or pass as params.
    [string]$ClientId     = $env:ISC_CLIENT_ID,
    [string]$ClientSecret = $env:ISC_CLIENT_SECRET,

    # Supply a bearer token directly (env var or param).
    # Falls back to interactive paste if nothing else is available.
    [string]$BearerToken  = $env:ISC_BEARER_TOKEN
)

# =============================================================================
# CONFIGURATION — TENANT URL
# Required. Set $env:ISC_TENANT_URL before running, or pass -TenantUrl.
# =============================================================================
if ([string]::IsNullOrWhiteSpace($TenantUrl)) {
    Write-Host "No tenant URL found in ISC_TENANT_URL env var or -TenantUrl param." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Enter your ISC tenant API URL and press Enter." -ForegroundColor Cyan
    Write-Host "  Use the API URL (with .api. in it), NOT the browser/UI URL:" -ForegroundColor Cyan
    Write-Host "    CORRECT : https://acme.api.identitynow.com" -ForegroundColor Green
    Write-Host "    CORRECT : https://acme.api.identitynow-demo.com" -ForegroundColor Green
    Write-Host "    WRONG   : https://acme.identitynow.com  (missing .api.)" -ForegroundColor Red
    Write-Host "    WRONG   : https://acme.identitynow-demo.com  (missing .api.)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Tenant API URL: " -ForegroundColor Cyan -NoNewline
    $TenantUrl = ([Console]::ReadLine()).Trim().TrimEnd('/')
}

# Auto-correct common mistake: UI URL missing .api. segment
# e.g. https://acme.identitynow.com → https://acme.api.identitynow.com
if ($TenantUrl -match '^(https://[^.]+)\.(identitynow(?:-demo)?\.com)') {
    $corrected = "$($Matches[1]).api.$($Matches[2])"
    Write-Host "  Note: URL auto-corrected to API format: $corrected" -ForegroundColor Yellow
    $TenantUrl = $corrected
}

$baseUrl = $TenantUrl.TrimEnd('/')

# =============================================================================
# TOKEN ACQUISITION
# Priority order:
#   1. OAuth2 client credentials (ISC_CLIENT_ID + ISC_CLIENT_SECRET) — automatic
#   2. Bearer token param / ISC_BEARER_TOKEN env var — direct paste/supply
#   3. Interactive paste — fallback
# =============================================================================
if (-not [string]::IsNullOrWhiteSpace($ClientId) -and -not [string]::IsNullOrWhiteSpace($ClientSecret)) {
    Write-Host "Acquiring token via OAuth2 client credentials..." -ForegroundColor Cyan
    try {
        $oauthBody     = "grant_type=client_credentials&client_id=$ClientId&client_secret=$ClientSecret"
        $tokenResponse = Invoke-RestMethod -Uri "$baseUrl/oauth/token" -Method POST `
                             -ContentType "application/x-www-form-urlencoded" -Body $oauthBody
        $tokenPlain    = $tokenResponse.access_token
        Write-Host "Token acquired (expires in $($tokenResponse.expires_in)s)." -ForegroundColor Green
    } catch {
        Write-Host "OAuth2 token request failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} elseif (-not [string]::IsNullOrWhiteSpace($BearerToken)) {
    $tokenPlain = $BearerToken
    Write-Host "Using bearer token from parameter/environment." -ForegroundColor Cyan
} else {
    Write-Host "No credentials found. Paste your Bearer token and press Enter:" -ForegroundColor Cyan
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $tokenPlain = ([Console]::ReadLine()).Trim()
}

if ([string]::IsNullOrWhiteSpace($tokenPlain)) {
    Write-Host "No token available. Exiting." -ForegroundColor Red
    exit 1
}

# =============================================================================
# GUARD: Warn if the JWT org claim doesn't match the tenant URL
# Catches the most common mistake: pasting a token from the wrong tenant.
# =============================================================================
try {
    $jwtPayload = $tokenPlain.Split('.')[1]
    # Pad base64url to standard base64
    $pad = 4 - ($jwtPayload.Length % 4)
    if ($pad -ne 4) { $jwtPayload += '=' * $pad }
    $jwtPayload = $jwtPayload.Replace('-', '+').Replace('_', '/')
    $claims = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($jwtPayload)) | ConvertFrom-Json
    $jwtOrg  = $claims.org
    # Extract org slug from URL: https://SLUG.api.identitynow.com or https://SLUG.identitynow-demo.com etc.
    $urlOrg  = ([uri]$baseUrl).Host.Split('.')[0]
    if ($jwtOrg -and $jwtOrg -ne $urlOrg) {
        Write-Host ""
        Write-Host "  *** TOKEN/TENANT MISMATCH DETECTED ***" -ForegroundColor Red
        Write-Host "  Token org : $jwtOrg   (the token you pasted belongs to THIS tenant)" -ForegroundColor Red
        Write-Host "  URL org   : $urlOrg   ($baseUrl)" -ForegroundColor Red
        Write-Host ""
        Write-Host "  You need a token from '$urlOrg', not '$jwtOrg'." -ForegroundColor Yellow
        Write-Host "  In the ISC UI go to: Admin → Connections → OAuth Applications → your client → Generate Token" -ForegroundColor Yellow
        Write-Host "  Make sure you are logged into the correct tenant first." -ForegroundColor Yellow
        Write-Host ""
        exit 1
    }
    Write-Host "Token org verified: $jwtOrg matches $urlOrg" -ForegroundColor Green
} catch {
    # JWT parse failure is non-fatal — proceed, real errors will surface on first API call
    Write-Host "  (Could not decode JWT to verify org — proceeding)" -ForegroundColor DarkGray
}

# =============================================================================
# SPLIT HEADERS — GET vs PATCH
# =============================================================================
$getHeaders = @{
    Authorization = "Bearer $tokenPlain"
    Accept        = "application/json"
}

$patchHeaders = @{
    Authorization  = "Bearer $tokenPlain"
    'Content-Type' = "application/json-patch+json"
    Accept         = "application/json"
}

# =============================================================================
# OPERATION MODE
# =============================================================================
Write-Host "`nWhat would you like to do?"
Write-Host "  [U] Update existing criteria value"
Write-Host "      Finds a criteria leaf whose stringValue or values[] contains ONE specific"
Write-Host "      old value and replaces it. Enter a single value for OLD (not comma-separated)."
Write-Host "      To DROP one value from a multi-value node, use [R] → Remove specific value."
Write-Host "  [V] Add value(s) to an existing criteria node"
Write-Host "      Appends one or more values to an existing leaf node (stringValue → values[])."
Write-Host "      Use this to extend e.g. [active, loa] → [active, loa, terminated]."
Write-Host "  [A] Add new criteria block"
Write-Host "  [R] Remove criteria (specific value or entire attribute)"
Write-Host "  [C] Consolidate — merge multiple sibling OR nodes for the same attribute"
Write-Host "      into a single node with a values[] list."
Write-Host "      Example: 4 separate (Lifecycle State EQUALS active/loa/conversions/partnerExceptions)"
Write-Host "               -> 1 node with values: [active, loa, conversions, partnerExceptions]"
$operation = (Read-Host "Select operation (U/V/A/R/C)").ToUpper()

if ($operation -notin @("U", "V", "A", "R", "C")) {
    Write-Host "Invalid operation. Exiting." -ForegroundColor Red
    exit
}

# =============================================================================
# PROMPTS BASED ON OPERATION
# =============================================================================
if ($operation -eq "U") {
    $rawAttribute      = Read-Host "Enter the attribute to update (e.g., duNumber)"
    $attributeToUpdate = "attribute.$rawAttribute"
    Write-Host "  Note: Enter ONE single value to match (e.g., 011). Do not use commas." -ForegroundColor Yellow
    Write-Host "        To drop a value from a multi-value node, use operation [R] instead." -ForegroundColor Yellow
    Write-Host "        To add new values to an existing node, use operation [V] instead." -ForegroundColor Yellow
    $oldValue          = Read-Host "Enter the OLD value to match (e.g., 011)"
    $newValuesInput    = Read-Host "Enter the NEW value(s), comma-separated (e.g., 012,013)"
    $newValues         = $newValuesInput -split "," | ForEach-Object { $_.Trim() }
}

if ($operation -eq "V") {
    $rawAttribute      = Read-Host "Enter the attribute whose criteria node you want to add values to (e.g., cloudLifecycleState)"
    $attributeToUpdate = "attribute.$rawAttribute"
    Write-Host "  This will append to the existing values[] on the matching leaf node." -ForegroundColor Yellow
    Write-Host "  If the node currently has a stringValue it will be converted to a values[] array." -ForegroundColor Yellow
    $addValuesInput    = Read-Host "Enter the value(s) to add, comma-separated (e.g., terminated,leave)"
    $addValues         = $addValuesInput -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
}

if ($operation -eq "A") {
    $rawAttribute      = Read-Host "Enter the attribute to add criteria for (e.g., duNumber)"
    $attributeToUpdate = "attribute.$rawAttribute"

    Write-Host "`nSelect criteria operation type:"
    Write-Host "  [1] EQUALS"
    Write-Host "  [2] NOT_EQUALS"
    Write-Host "  [3] CONTAINS"
    Write-Host "  [4] STARTS_WITH"
    Write-Host "  [5] ENDS_WITH"
    $opChoice = Read-Host "Enter choice (1-5)"

    $operationMap = @{
        "1" = "EQUALS"
        "2" = "NOT_EQUALS"
        "3" = "CONTAINS"
        "4" = "STARTS_WITH"
        "5" = "ENDS_WITH"
    }

    if (-not $operationMap.ContainsKey($opChoice)) {
        Write-Host "Invalid operation type. Exiting." -ForegroundColor Red
        exit
    }

    $criteriaOperation = $operationMap[$opChoice]
    $newValuesInput    = Read-Host "Enter the value(s) for the new criteria, comma-separated"
    $newValues         = $newValuesInput -split "," | ForEach-Object { $_.Trim() }

    Write-Host "How should the new criteria be joined with existing criteria?"
    Write-Host "  [1] AND"
    Write-Host "  [2] OR"
    $joinChoice    = (Read-Host "Select join type (1/2)")
    $joinOperation = if ($joinChoice -eq "2") { "OR" } else { "AND" }
}

if ($operation -eq "R") {
    $rawAttribute      = Read-Host "Enter the attribute to remove criteria for (e.g., duNumber)"
    $attributeToUpdate = "attribute.$rawAttribute"

    Write-Host "What would you like to remove?"
    Write-Host "  [1] Remove a specific value from a criteria node"
    Write-Host "  [2] Remove all criteria nodes matching this attribute entirely"
    $removeChoice = (Read-Host "Select remove type (1/2)")

    if ($removeChoice -notin @("1", "2")) {
        Write-Host "Invalid remove type. Exiting." -ForegroundColor Red
        exit
    }

    if ($removeChoice -eq "1") {
        $removeValue = Read-Host "Enter the specific value to remove (e.g., 011)"
    }

    Write-Host "Note: If removing a criteria node leaves a parent with only one child," -ForegroundColor Yellow
    Write-Host "      the parent will be collapsed to avoid invalid criteria structure." -ForegroundColor Yellow
}

if ($operation -eq "C") {
    $rawAttribute      = Read-Host "Enter the attribute to consolidate (e.g., cloudLifecycleState)"
    $attributeToUpdate = "attribute.$rawAttribute"
    Write-Host "  All sibling OR leaf nodes sharing attribute '$attributeToUpdate' will be merged" -ForegroundColor Yellow
    Write-Host "  into a single node with a values[] list." -ForegroundColor Yellow
    Write-Host "  Duplicate values will be silently deduplicated." -ForegroundColor Yellow
}

# =============================================================================
# ROLE FILTER
# Use "eq" (exact match) for single-role mode, "co" (contains) for bulk.
# =============================================================================
$mode = (Read-Host "`nRun against (S)ingle role or (A)ll roles matching a filter? (S/A)").ToUpper()

switch ($mode) {
    "S" {
        $roleName = Read-Host "Enter the exact role name"
        $filter = [uri]::EscapeDataString("name eq `"$roleName`"")
    }
    "A" {
        $partialName = Read-Host "Enter partial name filter (e.g., DL)"
        $filter = [uri]::EscapeDataString("name co `"$partialName`"")
    }
    default {
        Write-Host "Invalid option. Exiting." -ForegroundColor Red
        exit
    }
}

# =============================================================================
# FUNCTIONS
# =============================================================================

function Update-CriteriaIfOldMatch {
    param (
        [psobject]$node,
        [string]$attribute,
        [string]$oldValue,
        [string[]]$newVals,
        [ref]$matched
    )

    if ($node -is [System.Collections.IDictionary] -or $node -is [psobject]) {
        if ($node.key -and $node.key.property -eq $attribute) {
            $match = $false

            if ($node.PSObject.Properties["stringValue"] -and $node.stringValue -eq $oldValue) {
                $match = $true
            }
            if ($node.PSObject.Properties["values"] -and $node.values -contains $oldValue) {
                $match = $true
            }

            if ($match) {
                $matched.Value = $true
                Write-Host "  Updating $($node.key.property) from '$oldValue' to '$($newVals -join ",")'"
                if ($newVals.Count -eq 1) {
                    $node.stringValue = $newVals[0]
                    if ($node.PSObject.Properties["values"]) {
                        # PS 5.1-safe property removal via round-trip
                        $node = $node | Select-Object -ExcludeProperty values
                    }
                } else {
                    $node.values = $newVals
                    if ($node.PSObject.Properties["stringValue"]) {
                        # PS 5.1-safe property removal via round-trip
                        $node = $node | Select-Object -ExcludeProperty stringValue
                    }
                }
            }
        }

        if ($node.children) {
            foreach ($child in $node.children) {
                Update-CriteriaIfOldMatch -node $child -attribute $attribute -oldValue $oldValue -newVals $newVals -matched $matched
            }
        }
    }
}

# Walks the criteria tree and appends $newVals to the first leaf matching
# $attribute. Converts stringValue → values[] if needed. Deduplicates.
function Add-ValuesToExistingNode {
    param (
        [psobject]$node,
        [string]$attribute,
        [string[]]$newVals,
        [ref]$matched
    )

    if ($node -is [psobject]) {
        if ($node.key -and $node.key.property -eq $attribute) {
            $matched.Value = $true

            $existing = @()
            if ($node.PSObject.Properties["values"] -and $null -ne $node.values) {
                $existing = @($node.values)
            } elseif ($node.PSObject.Properties["stringValue"] -and -not [string]::IsNullOrWhiteSpace($node.stringValue)) {
                $existing = @($node.stringValue)
                # PS 5.1-safe property removal via round-trip
                $node = $node | Select-Object -ExcludeProperty stringValue
                Write-Host "  Converting stringValue to values[] on $attribute" -ForegroundColor DarkGray
            }

            $added = @()
            foreach ($v in $newVals) {
                if ($existing -notcontains $v) {
                    $existing += $v
                    $added    += $v
                } else {
                    Write-Host "  Skipping '$v' — already present on $attribute" -ForegroundColor Yellow
                }
            }

            if ($added.Count -gt 0) {
                Write-Host "  Adding [$($added -join ", ")] to $attribute (now [$($existing -join ", ")])"
                if ($node.PSObject.Properties["values"]) {
                    $node.values = $existing
                } else {
                    $node | Add-Member -MemberType NoteProperty -Name "values" -Value $existing -Force
                }
            }
            return
        }

        if ($node.children) {
            foreach ($child in $node.children) {
                Add-ValuesToExistingNode -node $child -attribute $attribute -newVals $newVals -matched $matched
            }
        }
    }
}

function Build-NewCriteriaNode {
    param (
        [string]$attribute,
        [string]$operation,
        [string[]]$values
    )

    $node = [pscustomobject]@{
        operation = $operation
        key       = [pscustomobject]@{
            type     = "IDENTITY"
            property = $attribute
        }
    }

    if ($values.Count -eq 1) {
        $node | Add-Member -MemberType NoteProperty -Name "stringValue" -Value $values[0]
    } else {
        $node | Add-Member -MemberType NoteProperty -Name "values" -Value $values
    }

    return $node
}

function Add-CriteriaToBlock {
    param (
        [psobject]$existingCriteria,
        [psobject]$newNode,
        [string]$joinOp
    )

    if ($existingCriteria.PSObject.Properties["children"] -and $existingCriteria.children) {
        Write-Host "  Appending new criteria node under existing '$($existingCriteria.operation)' block"

        if ($existingCriteria.operation -eq $joinOp) {
            $existingCriteria.children += $newNode
        } else {
            $wrapped = [pscustomobject]@{
                operation = $joinOp
                children  = @($existingCriteria, $newNode)
            }
            return $wrapped
        }
        return $existingCriteria
    } else {
        Write-Host "  Wrapping existing criteria into new '$joinOp' block with new node"
        $wrapped = [pscustomobject]@{
            operation = $joinOp
            children  = @($existingCriteria, $newNode)
        }
        return $wrapped
    }
}

function Remove-CriteriaByValue {
    param (
        [psobject]$node,
        [string]$attribute,
        [string]$valueToRemove
    )

    if ($node.key -and $node.key.property -eq $attribute) {
        $match = $false

        if ($node.PSObject.Properties["stringValue"] -and $node.stringValue -eq $valueToRemove) {
            $match = $true
        }
        if ($node.PSObject.Properties["values"] -and $node.values -contains $valueToRemove) {
            $remaining = @($node.values | Where-Object { $_ -ne $valueToRemove })
            if ($remaining.Count -eq 0) {
                $match = $true
            } elseif ($remaining.Count -eq 1) {
                Write-Host "  Removed value '$valueToRemove'. One value remaining, converting to stringValue."
                # PS 5.1-safe property removal via round-trip
                $node = $node | Select-Object -ExcludeProperty values
                $node | Add-Member -MemberType NoteProperty -Name "stringValue" -Value $remaining[0] -Force
                return $node
            } else {
                Write-Host "  Removed value '$valueToRemove' from multi-value node."
                $node.values = $remaining
                return $node
            }
        }

        if ($match) {
            Write-Host "  Removing criteria node for '$attribute' with value '$valueToRemove'"
            return $null
        }

        return $node
    }

    if ($node.PSObject.Properties["children"] -and $node.children) {
        $updatedChildren = @()

        foreach ($child in $node.children) {
            $result = Remove-CriteriaByValue -node $child -attribute $attribute -valueToRemove $valueToRemove
            if ($null -ne $result) {
                $updatedChildren += $result
            }
        }

        if ($updatedChildren.Count -eq 0) {
            Write-Host "  Parent criteria block is now empty. Removing it." -ForegroundColor Yellow
            return $null
        }

        if ($updatedChildren.Count -eq 1) {
            Write-Host "  Parent criteria block has only one child remaining. Collapsing." -ForegroundColor Yellow
            return $updatedChildren[0]
        }

        $node.children = $updatedChildren
        return $node
    }

    return $node
}

# Prints leaf attribute names and current values from a criteria tree.
# Called when a lookup fails to help identify the correct attribute name.
function Get-LeafAttributes {
    param ([psobject]$node)
    if ($node.key) {
        $val = if ($node.stringValue) { $node.stringValue } else { $node.values -join ", " }
        Write-Host "    - $($node.key.property)  ($val)" -ForegroundColor Yellow
    }
    if ($node.children) { foreach ($c in $node.children) { Get-LeafAttributes $c } }
}

function Remove-CriteriaByAttribute {
    param (
        [psobject]$node,
        [string]$attribute
    )

    if ($node.key -and $node.key.property -eq $attribute) {
        Write-Host "  Removing criteria node for attribute '$attribute'"
        return $null
    }

    if ($node.PSObject.Properties["children"] -and $node.children) {
        $updatedChildren = @()

        foreach ($child in $node.children) {
            $result = Remove-CriteriaByAttribute -node $child -attribute $attribute
            if ($null -ne $result) {
                $updatedChildren += $result
            }
        }

        if ($updatedChildren.Count -eq 0) {
            Write-Host "  Parent criteria block is now empty after removal. Removing it." -ForegroundColor Yellow
            return $null
        }

        if ($updatedChildren.Count -eq 1) {
            Write-Host "  Parent criteria block has only one child remaining. Collapsing." -ForegroundColor Yellow
            return $updatedChildren[0]
        }

        $node.children = $updatedChildren
        return $node
    }

    return $node
}

# Merges sibling OR-level leaf nodes for the same attribute into a single
# node with a values[] list. Walks bottom-up; deduplicates values.
# Collapses an OR parent that ends up with only one child.
function Consolidate-SiblingNodes {
    param (
        [psobject]$node,
        [string]$attribute,
        [ref]$matched
    )

    # Leaf node — nothing to consolidate at this level
    if (-not ($node.PSObject.Properties["children"]) -or $null -eq $node.children) {
        return $node
    }

    # Recurse into children first (bottom-up)
    $processedChildren = @()
    foreach ($child in $node.children) {
        $result = Consolidate-SiblingNodes -node $child -attribute $attribute -matched $matched
        if ($null -ne $result) {
            $processedChildren += $result
        }
    }
    $node.children = $processedChildren

    # Only consolidate at OR level
    if ($node.operation -ne "OR") {
        return $node
    }

    # Partition children: matching leaves vs everything else
    $matchingLeaves    = @($node.children | Where-Object { $_.key -and $_.key.property -eq $attribute })
    $remainingChildren = @($node.children | Where-Object { -not ($_.key -and $_.key.property -eq $attribute) })

    if ($matchingLeaves.Count -lt 2) {
        return $node
    }

    $matched.Value = $true

    # Collect all values from matching leaves, deduplicating
    $mergedValues = @()
    foreach ($leaf in $matchingLeaves) {
        if ($leaf.PSObject.Properties["values"] -and $null -ne $leaf.values) {
            foreach ($v in $leaf.values) {
                if ($mergedValues -notcontains $v) { $mergedValues += $v }
            }
        } elseif ($leaf.PSObject.Properties["stringValue"] -and -not [string]::IsNullOrWhiteSpace($leaf.stringValue)) {
            if ($mergedValues -notcontains $leaf.stringValue) { $mergedValues += $leaf.stringValue }
        }
    }

    Write-Host "  Consolidating $($matchingLeaves.Count) sibling '$attribute' nodes -> 1 node with values: [$($mergedValues -join ', ')]" -ForegroundColor Cyan

    # Build consolidated leaf, preserving the original operation (e.g. EQUALS)
    $consolidatedLeaf = [pscustomobject]@{
        operation = $matchingLeaves[0].operation
        key       = [pscustomobject]@{
            type     = "IDENTITY"
            property = $attribute
        }
    }

    if ($mergedValues.Count -eq 1) {
        $consolidatedLeaf | Add-Member -MemberType NoteProperty -Name "stringValue" -Value $mergedValues[0]
    } else {
        $consolidatedLeaf | Add-Member -MemberType NoteProperty -Name "values" -Value $mergedValues
    }

    # Rebuild children: consolidated leaf first, then remaining
    $newChildren = @($consolidatedLeaf) + $remainingChildren

    if ($newChildren.Count -eq 1) {
        Write-Host "  OR parent now has only 1 child after consolidation — collapsing parent." -ForegroundColor DarkGray
        return $newChildren[0]
    }

    $node.children = $newChildren
    return $node
}

# =============================================================================
# PAGINATED ROLE FETCH with limit=250
# =============================================================================
Write-Host "`nFetching roles..." -ForegroundColor Cyan
$allRoles = @()
$pageSize = 250
$offset   = 0

do {
    $page = Invoke-RestMethod `
        -Uri     "$baseUrl/v3/roles?limit=$pageSize&offset=$offset&filters=$filter" `
        -Headers $getHeaders `
        -Method  GET
    $allRoles += $page
    $offset   += $pageSize
} while ($page.Count -eq $pageSize)

Write-Host "Found $($allRoles.Count) role(s) matching filter." -ForegroundColor Cyan

if ($allRoles.Count -eq 0) {
    Write-Host "No roles found. Exiting." -ForegroundColor Yellow
    exit
}

# =============================================================================
# SAFETY: Single-role mode — clamp to first result only
# ISC name eq filters are exact-match but this guard ensures that even if the
# API unexpectedly returns more than one result (e.g. duplicate names in the
# tenant), we never silently process more than the one role the user named.
# =============================================================================
if ($mode -eq "S" -and $allRoles.Count -gt 1) {
    Write-Host ""
    Write-Host "  *** SAFETY WARNING ***" -ForegroundColor Yellow
    Write-Host "  Single-role mode returned $($allRoles.Count) roles for name '$roleName'." -ForegroundColor Yellow
    Write-Host "  This should not happen — ISC role names are meant to be unique." -ForegroundColor Yellow
    Write-Host "  Only the FIRST result will be processed as a safety measure:" -ForegroundColor Yellow
    Write-Host "    ID  : $($allRoles[0].id)" -ForegroundColor Yellow
    Write-Host "    Name: $($allRoles[0].name)" -ForegroundColor Yellow
    Write-Host ""
    $allRoles = @($allRoles[0])
}

# =============================================================================
# PRE-RUN SNAPSHOT (rollback safety)
# Exports each matched role's full membership before any PATCH is applied.
# To rollback: re-PATCH each role from the snapshot's membership field.
# =============================================================================
$snapshotFile = "role-criteria-snapshot-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
Write-Host "`nTaking pre-run snapshot -> $snapshotFile" -ForegroundColor Cyan

$snapshot = @()
foreach ($role in $allRoles) {
    try {
        $rd = Invoke-RestMethod -Uri "$baseUrl/v3/roles/$($role.id)" -Headers $getHeaders -Method GET
        $snapshot += [pscustomobject]@{
            id         = $rd.id
            name       = $rd.name
            membership = $rd.membership
        }
    } catch {
        Write-Host "  Warning: could not snapshot role '$($role.name)': $($_.Exception.Message)" -ForegroundColor Yellow
    }
}
$snapshot | ConvertTo-Json -Depth 20 | Out-File -FilePath $snapshotFile -Encoding UTF8
Write-Host "Snapshot saved: $snapshotFile" -ForegroundColor Green

# =============================================================================
# MAIN LOOP
# =============================================================================
$results = @()

foreach ($role in $allRoles) {
    $roleId   = $role.id
    $roleName = $role.name
    $roleUrl  = "$baseUrl/v3/roles/$roleId"

    Write-Host "`nProcessing role: $roleName ($roleId)"

    $patchOperations = $null

    $roleDetails = Invoke-RestMethod -Uri $roleUrl -Headers $getHeaders -Method GET

    # ------------------------------------------------------------------
    # OPERATION: UPDATE existing criteria value
    # ------------------------------------------------------------------
    if ($operation -eq "U") {
        if ($roleDetails.membership -and $roleDetails.membership.criteria) {
            $criteriaJson   = $roleDetails.membership.criteria | ConvertTo-Json -Depth 15
            $clonedCriteria = $criteriaJson | ConvertFrom-Json

            $matched = [ref]$false
            Update-CriteriaIfOldMatch `
                -node      $clonedCriteria `
                -attribute $attributeToUpdate `
                -oldValue  $oldValue `
                -newVals   $newValues `
                -matched   $matched

            if (-not $matched.Value) {
                Write-Host "  No criteria node found with attribute '$attributeToUpdate' containing value '$oldValue' on role '$roleName'." -ForegroundColor Red
                Write-Host "  Check for typos. Attributes in this role's criteria:" -ForegroundColor Yellow
                Get-LeafAttributes $clonedCriteria
                $results += [pscustomobject]@{ Role = $roleName; Status = "Skipped (value not found)" }
                continue
            }

            $newMembership = @{
                type       = "STANDARD"
                criteria   = $clonedCriteria
                identities = $roleDetails.membership.identities
            }

            $patchOperations = @(@{
                op    = "replace"
                path  = "/membership"
                value = $newMembership
            })
        } else {
            Write-Host "  Role '$roleName' has no criteria block. Skipping (use Add mode instead)." -ForegroundColor Yellow
            $results += [pscustomobject]@{ Role = $roleName; Status = "Skipped (no criteria)" }
            continue
        }
    }

    # ------------------------------------------------------------------
    # OPERATION: ADD VALUE(S) to existing criteria node
    # ------------------------------------------------------------------
    if ($operation -eq "V") {
        if ($roleDetails.membership -and $roleDetails.membership.criteria) {
            $criteriaJson   = $roleDetails.membership.criteria | ConvertTo-Json -Depth 15
            $clonedCriteria = $criteriaJson | ConvertFrom-Json

            $matched = [ref]$false
            Add-ValuesToExistingNode `
                -node      $clonedCriteria `
                -attribute $attributeToUpdate `
                -newVals   $addValues `
                -matched   $matched

            if (-not $matched.Value) {
                Write-Host "  No criteria node found for attribute '$attributeToUpdate' on role '$roleName'." -ForegroundColor Red
                Write-Host "  Check the attribute name for typos. Available attributes in this role's criteria:" -ForegroundColor Yellow
                Get-LeafAttributes $clonedCriteria
                $results += [pscustomobject]@{ Role = $roleName; Status = "Skipped (attribute not found)" }
                continue
            }

            $newMembership = @{
                type       = "STANDARD"
                criteria   = $clonedCriteria
                identities = $roleDetails.membership.identities
            }

            $patchOperations = @(@{
                op    = "replace"
                path  = "/membership"
                value = $newMembership
            })
        } else {
            Write-Host "  Role '$roleName' has no criteria block. Use [A] to create one first." -ForegroundColor Yellow
            $results += [pscustomobject]@{ Role = $roleName; Status = "Skipped (no criteria)" }
            continue
        }
    }

    # ------------------------------------------------------------------
    # OPERATION: ADD new criteria block
    # ------------------------------------------------------------------
    if ($operation -eq "A") {
        $newNode = Build-NewCriteriaNode `
            -attribute $attributeToUpdate `
            -operation $criteriaOperation `
            -values    $newValues

        if ($roleDetails.membership -and $roleDetails.membership.criteria) {
            $criteriaJson   = $roleDetails.membership.criteria | ConvertTo-Json -Depth 15
            $clonedCriteria = $criteriaJson | ConvertFrom-Json

            $updatedCriteria = Add-CriteriaToBlock `
                -existingCriteria $clonedCriteria `
                -newNode          $newNode `
                -joinOp           $joinOperation

            $newMembership = @{
                type       = "STANDARD"
                criteria   = $updatedCriteria
                identities = $roleDetails.membership.identities
            }

            $patchOperations = @(@{
                op    = "replace"
                path  = "/membership"
                value = $newMembership
            })
        } else {
            Write-Host "  No existing criteria found. Creating new criteria block."

            $newMembership = @{
                type       = "STANDARD"
                criteria   = $newNode
                identities = $roleDetails.membership.identities
            }

            $patchOperations = @(@{
                op    = "add"
                path  = "/membership"
                value = $newMembership
            })
        }
    }

    # ------------------------------------------------------------------
    # OPERATION: REMOVE criteria
    # ------------------------------------------------------------------
    if ($operation -eq "R") {
        if ($roleDetails.membership -and $roleDetails.membership.criteria) {
            $criteriaJson   = $roleDetails.membership.criteria | ConvertTo-Json -Depth 15
            $clonedCriteria = $criteriaJson | ConvertFrom-Json

            if ($removeChoice -eq "1") {
                $updatedCriteria = Remove-CriteriaByValue `
                    -node          $clonedCriteria `
                    -attribute     $attributeToUpdate `
                    -valueToRemove $removeValue
            } else {
                $updatedCriteria = Remove-CriteriaByAttribute `
                    -node      $clonedCriteria `
                    -attribute $attributeToUpdate
            }

            if ($null -eq $updatedCriteria) {
                Write-Host "  All criteria removed. Removing entire membership block." -ForegroundColor Yellow
                $patchOperations = @(@{
                    op   = "remove"
                    path = "/membership"
                })
            } else {
                $newMembership = @{
                    type       = "STANDARD"
                    criteria   = $updatedCriteria
                    identities = $roleDetails.membership.identities
                }
                $patchOperations = @(@{
                    op    = "replace"
                    path  = "/membership"
                    value = $newMembership
                })
            }
        } else {
            Write-Host "  Role '$roleName' has no criteria block. Nothing to remove." -ForegroundColor Yellow
            $results += [pscustomobject]@{ Role = $roleName; Status = "Skipped (no criteria)" }
            continue
        }
    }

    # ------------------------------------------------------------------
    # OPERATION: CONSOLIDATE sibling OR nodes for the same attribute
    # ------------------------------------------------------------------
    if ($operation -eq "C") {
        if ($roleDetails.membership -and $roleDetails.membership.criteria) {
            $criteriaJson   = $roleDetails.membership.criteria | ConvertTo-Json -Depth 15
            $clonedCriteria = $criteriaJson | ConvertFrom-Json

            $matched = [ref]$false
            $updatedCriteria = Consolidate-SiblingNodes `
                -node      $clonedCriteria `
                -attribute $attributeToUpdate `
                -matched   $matched

            if (-not $matched.Value) {
                Write-Host "  No sibling nodes found for attribute '$attributeToUpdate' on role '$roleName'." -ForegroundColor Yellow
                Write-Host "  Either the attribute is not present or only one node exists (already consolidated)." -ForegroundColor Yellow
                $results += [pscustomobject]@{ Role = $roleName; Status = "Skipped (nothing to consolidate)" }
                continue
            }

            $newMembership = @{
                type       = "STANDARD"
                criteria   = $updatedCriteria
                identities = $roleDetails.membership.identities
            }

            $patchOperations = @(@{
                op    = "replace"
                path  = "/membership"
                value = $newMembership
            })
        } else {
            Write-Host "  Role '$roleName' has no criteria block. Nothing to consolidate." -ForegroundColor Yellow
            $results += [pscustomobject]@{ Role = $roleName; Status = "Skipped (no criteria)" }
            continue
        }
    }

    if ($null -eq $patchOperations) {
        Write-Host "  No patch generated for '$roleName'. Skipping." -ForegroundColor Yellow
        $results += [pscustomobject]@{ Role = $roleName; Status = "Skipped (no patch)" }
        continue
    }

    # Serialize as a JSON Patch array — works on PS 5.1 and PS 7+.
    $patchBody = "[" + ($patchOperations | ConvertTo-Json -Depth 15 -Compress) + "]"

    if ($PSCmdlet.ShouldProcess($roleName, "PATCH /v3/roles/$roleId")) {
        try {
            Invoke-RestMethod -Uri $roleUrl -Method Patch -Headers $patchHeaders -Body $patchBody | Out-Null
            Write-Host "  Role '$roleName' updated successfully." -ForegroundColor Green
            $results += [pscustomobject]@{ Role = $roleName; Status = "Updated" }
        } catch {
            Write-Host "  Failed to update role '$roleName':" -ForegroundColor Red

            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                try {
                    $errDetail = $_.ErrorDetails.Message | ConvertFrom-Json
                    $errMsg    = if ($errDetail.messages -and $errDetail.messages.Count -gt 0) {
                        $errDetail.messages[0].text
                    } else { $_.ErrorDetails.Message }
                    Write-Host "  Message:    $errMsg"                          -ForegroundColor Red
                    Write-Host "  DetailCode: $($errDetail.detailCode)"         -ForegroundColor Red
                    Write-Host "  TrackingId: $($errDetail.trackingId)"         -ForegroundColor Red
                } catch {
                    Write-Host "  $($_.ErrorDetails.Message)"                   -ForegroundColor Red
                }
            } else {
                Write-Host "  $($_.Exception.Message)"                          -ForegroundColor Red
            }

            $results += [pscustomobject]@{ Role = $roleName; Status = "Error" }
        }
    } else {
        Write-Host "  [WhatIf] Would PATCH $roleUrl with body:" -ForegroundColor DarkCyan
        Write-Host "  $patchBody" -ForegroundColor DarkCyan
        $results += [pscustomobject]@{ Role = $roleName; Status = "WhatIf" }
    }
}

# =============================================================================
# SUMMARY
# =============================================================================
Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host "Run complete. Results:" -ForegroundColor Cyan
$results | Format-Table -AutoSize
Write-Host "Pre-run snapshot: $snapshotFile" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
